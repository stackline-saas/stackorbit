import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { prisma, logAudit } from '../db.js';
import { dockerService } from '../services/docker.service.js';
import { traefikService } from '../services/traefik.service.js';
import { siteFilesService } from '../services/site-files.service.js';
import { SERVICE_TEMPLATES } from '../templates.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { parseServiceMetadata, serializeServiceMetadata, matchContainersForService } from './services.routes.js';
import { config } from '../config.js';

const router = Router();

// Trava para ambientes de produção: Sites Web disponível apenas se enableBetaFeatures estiver ativo
router.use((_req, res, next) => {
  if (!config.enableBetaFeatures) {
    return res.status(403).json({
      error: 'O módulo de Sites Web está em desenvolvimento e temporariamente desabilitado em produção.',
      code: 'FEATURE_DISABLED_IN_PRODUCTION',
    });
  }
  next();
});

// Configura multer para upload temporário
const upload = multer({
  dest: process.platform === 'win32' ? path.resolve(process.cwd(), 'temp', 'uploads') : '/tmp/stackorbit-uploads',
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limite por arquivo
});

// Garante que o diretório temporário exista
const tempUploadDir = process.platform === 'win32' ? path.resolve(process.cwd(), 'temp', 'uploads') : '/tmp/stackorbit-uploads';
if (!fsSync.existsSync(tempUploadDir)) {
  fsSync.mkdirSync(tempUploadDir, { recursive: true });
}

// 1. Listar todos os sites
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.query;

  try {
    const where: any = {};
    if (projectId && typeof projectId === 'string') {
      where.projectId = projectId;
    }

    const allServices = await prisma.service.findMany({
      where,
      include: {
        domains: true,
        project: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filtra serviços que são sites (marcador no metadata ou templates de sites)
    const siteServices = allServices.filter((s) => {
      const { meta } = parseServiceMetadata(s.notes);
      if (meta.isSite) return true;
      const lower = (s.notes || '').toLowerCase();
      return lower.includes('site estático') || lower.includes('site php') || lower.includes('wordpress') || lower.includes('prestashop');
    });

    return res.json(siteServices);
  } catch (err: any) {
    console.error('Erro ao listar sites:', err);
    return res.status(500).json({ error: 'Erro ao carregar lista de sites.' });
  }
});

// 2. Criar novo site a partir de template
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { templateId, name, containerName, domainName, projectId, dockerHostId, values = {}, sftpPassword } = req.body;

  const template = SERVICE_TEMPLATES.find((t) => t.id === templateId) || SERVICE_TEMPLATES.find((t) => t.id === 'static-site');
  if (!template) {
    return res.status(404).json({ error: 'Template não encontrado.' });
  }

  const cleanName = (name || template.name).trim();
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  const cleanContainerName = (containerName || `${slug}-${Date.now().toString(36)}`).trim();

  try {
    const existing = await prisma.service.findUnique({ where: { containerName: cleanContainerName } });
    if (existing) {
      return res.status(409).json({ error: `Já existe um serviço com o containerName "${cleanContainerName}".` });
    }

    let finalProjectId = projectId;
    let finalDockerHostId = dockerHostId;

    if (!finalProjectId) {
      const defProj = (await prisma.project.findFirst({ where: { isDefault: true } })) || (await prisma.project.findFirst());
      finalProjectId = defProj?.id || null;
    }

    if (!finalDockerHostId && finalProjectId) {
      const hostInProject = await prisma.dockerHost.findFirst({ where: { projectId: finalProjectId } });
      const defHost = hostInProject || (await prisma.dockerHost.findFirst({ where: { isDefault: true } }));
      finalDockerHostId = defHost?.id || null;
    }

    const generatedSftpPass = sftpPassword || `Sftp@${Math.random().toString(36).slice(2, 8)}!2026`;
    const sftpUser = `site_${slug.slice(0, 12)}`;

    // Metadados do site
    const siteMeta = {
      isSite: true,
      siteType: template.siteType || 'STATIC',
      documentRoot: template.documentRoot || '/var/www/html',
      sftpUser,
      sftpPassword: generatedSftpPass,
      sftpPort: 2222,
      linkedContainers: [] as string[],
    };

    let envVars = template.generateEnv(values);

    // Cria registro do serviço
    const service = await prisma.service.create({
      data: {
        name: cleanName,
        containerName: cleanContainerName,
        image: template.defaultImage,
        internalPort: template.defaultPort,
        status: 'running',
        isActive: true,
        sourceType: 'IMAGE',
        envVars,
        notes: serializeServiceMetadata(`Site Web: ${template.name}`, siteMeta),
        projectId: finalProjectId,
        dockerHostId: finalDockerHostId,
      },
    });

    // Inicializa diretório físico no host com arquivos de exemplo
    await siteFilesService.seedInitialSiteFiles(service.id, siteMeta.siteType, cleanName);
    const siteRootDir = siteFilesService.getSiteRootDir(service.id);
    const docRoot = template.documentRoot || (template.siteType === 'STATIC' ? '/usr/share/nginx/html' : '/var/www/html');
    const volumeBind = `${siteRootDir}:${docRoot}`;

    // Se o template requer banco companheiro (WordPress, PrestaShop)
    if (template.hasDatabaseCompanion) {
      const dbContainerName = `${cleanContainerName}-db`;
      const dbPass = values.WORDPRESS_DB_PASSWORD || values.DB_PASSWD || `Db@${Math.random().toString(36).slice(2, 8)}!2026`;
      const dbUser = values.WORDPRESS_DB_USER || values.DB_USER || 'app_user';
      const dbName = values.WORDPRESS_DB_NAME || values.DB_NAME || 'app_db';

      try {
        await dockerService.deployContainer({
          containerName: dbContainerName,
          image: 'mariadb:11',
          envVars:
            `MARIADB_USER=${dbUser}\n` +
            `MARIADB_PASSWORD=${dbPass}\n` +
            `MARIADB_ROOT_PASSWORD=${dbPass}_root\n` +
            `MARIADB_DATABASE=${dbName}`,
        });

        siteMeta.linkedContainers.push(dbContainerName);
        await prisma.service.update({
          where: { id: service.id },
          data: { notes: serializeServiceMetadata(`Site Web: ${template.name}`, siteMeta) },
        });

        // Atualiza envVars do container principal apontando para o container MariaDB companheiro
        if (template.siteType === 'WORDPRESS') {
          envVars =
            `WORDPRESS_DB_HOST=${dbContainerName}:3306\n` +
            `WORDPRESS_DB_USER=${dbUser}\n` +
            `WORDPRESS_DB_PASSWORD=${dbPass}\n` +
            `WORDPRESS_DB_NAME=${dbName}`;
        } else if (template.siteType === 'ECOMMERCE') {
          envVars =
            `DB_SERVER=${dbContainerName}:3306\n` +
            `DB_USER=${dbUser}\n` +
            `DB_PASSWD=${dbPass}\n` +
            `DB_NAME=${dbName}`;
        }

        await prisma.service.update({
          where: { id: service.id },
          data: { envVars },
        });
      } catch (dbErr: any) {
        console.warn(`Aviso no deploy do banco companheiro para ${cleanContainerName}:`, dbErr.message);
      }
    }

    // Deploy do container do site com o volume montado
    try {
      const containerId = await dockerService.deployContainer({
        containerName: cleanContainerName,
        image: template.defaultImage,
        envVars,
        binds: [volumeBind],
      });
      await prisma.service.update({ where: { id: service.id }, data: { containerId, volumes: volumeBind } });
      // Sincroniza arquivos iniciais para o container
      await siteFilesService.syncFilesToContainer(service.id);
    } catch (e: any) {
      console.warn(`Aviso no deploy do container do site ${service.id}:`, e.message);
    }

    // Associação de domínio se informado
    let domainCreated = null;
    if (domainName && domainName.trim()) {
      const cleanDomain = domainName.trim().toLowerCase();
      domainCreated = await prisma.domain.create({
        data: {
          domainName: cleanDomain,
          serviceId: service.id,
          isActive: true,
          sslStatus: 'cloudflare_proxied',
        },
      });
      await traefikService.applyConfig(req.user?.name || 'Administrador');
    }

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'SITE_CREATED',
      entityType: 'SERVICE',
      entityId: service.id,
      details: `Site criado com template ${template.name}: ${service.name} (${cleanContainerName})`,
    });

    const hostIp = process.env.ORIGIN_SERVER_IP || '169.58.122.148';
    return res.status(201).json({
      success: true,
      service,
      domain: domainCreated,
      sftpCredentials: {
        host: hostIp,
        port: siteMeta.sftpPort,
        username: siteMeta.sftpUser,
        password: siteMeta.sftpPassword,
        remotePath: '/',
        connectionString: `sftp://${siteMeta.sftpUser}:${siteMeta.sftpPassword}@${hostIp}:${siteMeta.sftpPort}`,
      },
    });
  } catch (err: any) {
    console.error('Erro ao criar site:', err);
    return res.status(500).json({ error: err.message || 'Erro ao criar site.' });
  }
});

// 2.1 Publicar alterações do site no container
router.post('/:id/publish', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  try {
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) return res.status(404).json({ error: 'Site não encontrado.' });

    // Sincroniza todos os arquivos do site para o container e recarrega o Nginx
    await siteFilesService.syncFilesToContainer(id);

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'SITE_PUBLISHED',
      entityType: 'SERVICE',
      entityId: service.id,
      details: `Site ${service.name} publicado com sucesso no container ${service.containerName}`,
    });

    return res.json({
      success: true,
      publishedAt: new Date().toISOString(),
      message: 'Site publicado e no ar com sucesso!',
    });
  } catch (err: any) {
    console.error('Erro ao publicar site:', err);
    return res.status(500).json({ error: err.message || 'Erro ao publicar site.' });
  }
});

// 3. Obter detalhes e credenciais SFTP de um site
router.get('/:id/sftp', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  try {
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) return res.status(404).json({ error: 'Site não encontrado.' });

    const { meta } = parseServiceMetadata(service.notes);
    const hostIp = process.env.ORIGIN_SERVER_IP || '169.58.122.148';
    const sftpUser = meta.sftpUser || `site_${service.containerName.slice(0, 10)}`;
    const sftpPass = meta.sftpPassword || 'StackOrbit@2026!Sec';
    const sftpPort = meta.sftpPort || 2222;

    return res.json({
      host: hostIp,
      port: sftpPort,
      username: sftpUser,
      password: sftpPass,
      remotePath: '/',
      connectionString: `sftp://${sftpUser}:${encodeURIComponent(sftpPass)}@${hostIp}:${sftpPort}`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao obter credenciais SFTP.' });
  }
});

// 4. Redefinir senha SFTP
router.post('/:id/sftp/reset', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  try {
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) return res.status(404).json({ error: 'Site não encontrado.' });

    const { userNotes, meta } = parseServiceMetadata(service.notes);
    const sftpPass = newPassword || `Sftp@${Math.random().toString(36).slice(2, 8)}!2026`;
    meta.sftpPassword = sftpPass;

    await prisma.service.update({
      where: { id },
      data: { notes: serializeServiceMetadata(userNotes, meta) },
    });

    const hostIp = process.env.ORIGIN_SERVER_IP || '169.58.122.148';
    return res.json({
      success: true,
      username: meta.sftpUser,
      password: sftpPass,
      connectionString: `sftp://${meta.sftpUser}:${encodeURIComponent(sftpPass)}@${hostIp}:${meta.sftpPort || 2222}`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao redefinir senha SFTP.' });
  }
});

// ==========================================
// ROTAS DO GERENCIADOR DE ARQUIVOS
// ==========================================

// 5. Listar arquivos do site
router.get('/:id/files', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const subPath = (req.query.path as string) || '';

  try {
    const result = await siteFilesService.listFiles(id, subPath);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao listar arquivos.' });
  }
});

// 6. Ler conteúdo de arquivo para o editor
router.get('/:id/files/content', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const filePath = req.query.path as string;

  if (!filePath) {
    return res.status(400).json({ error: 'Caminho do arquivo é obrigatório.' });
  }

  try {
    const content = await siteFilesService.readFile(id, filePath);
    return res.json({ path: filePath, content });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao ler arquivo.' });
  }
});

// 7. Salvar conteúdo de arquivo editado (suporta PUT e POST)
const handleSaveContent = async (req: AuthenticatedRequest, res: any) => {
  const { id } = req.params;
  const { path: filePath, content } = req.body;

  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'Caminho e conteúdo são obrigatórios.' });
  }

  try {
    await siteFilesService.writeFile(id, filePath, content);
    return res.json({ success: true, message: 'Arquivo salvo com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao salvar arquivo.' });
  }
};
router.put('/:id/files/content', requireAuth, handleSaveContent);
router.post('/:id/files/content', requireAuth, handleSaveContent);
router.post('/:id/files', requireAuth, handleSaveContent);
router.put('/:id/files', requireAuth, handleSaveContent);

// Criar pasta explicitamente (mkdir)
router.post('/:id/files/mkdir', requireAuth, async (req: AuthenticatedRequest, res: any) => {
  const { id } = req.params;
  const { path: dirPath } = req.body;

  if (!dirPath) {
    return res.status(400).json({ error: 'Caminho do diretório é obrigatório.' });
  }

  try {
    await siteFilesService.createDirectory(id, dirPath);
    return res.json({ success: true, message: 'Diretório criado com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao criar diretório.' });
  }
});

// 8. Criar novo arquivo ou pasta
router.post('/:id/files/create', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { path: itemPath, isDirectory = false, content = '' } = req.body;

  if (!itemPath) {
    return res.status(400).json({ error: 'Caminho é obrigatório.' });
  }

  try {
    if (isDirectory) {
      await siteFilesService.createDirectory(id, itemPath);
    } else {
      await siteFilesService.createFile(id, itemPath, content);
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao criar item.' });
  }
});

// 9. Excluir arquivo ou pasta
router.delete('/:id/files', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const itemPath = req.query.path as string;

  if (!itemPath) {
    return res.status(400).json({ error: 'Caminho do item é obrigatório.' });
  }

  try {
    await siteFilesService.deleteItem(id, itemPath);
    return res.json({ success: true, message: 'Item excluído com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao excluir item.' });
  }
});

// 10. Renomear ou mover item
router.post('/:id/files/rename', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { oldPath, newPath } = req.body;

  if (!oldPath || !newPath) {
    return res.status(400).json({ error: 'Caminhos de origem e destino são obrigatórios.' });
  }

  try {
    await siteFilesService.renameItem(id, oldPath, newPath);
    return res.json({ success: true, message: 'Item renomeado com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao renomear item.' });
  }
});

// 11. Upload de arquivos (Multipart)
router.post('/:id/files/upload', requireAuth, upload.array('files'), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const targetSubPath = (req.body.targetPath as string) || '';
  const uploadedFiles = req.files as Express.Multer.File[];

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  try {
    const targetDir = siteFilesService.resolveSafePath(id, targetSubPath);

    for (const file of uploadedFiles) {
      const destination = path.join(targetDir, file.originalname);
      await fs.copyFile(file.path, destination);
      await fs.unlink(file.path).catch(() => {});
    }

    await siteFilesService.syncFilesToContainer(id);

    return res.json({
      success: true,
      message: `${uploadedFiles.length} arquivo(s) enviado(s) com sucesso.`,
    });
  } catch (err: any) {
    // Limpa temporários
    if (uploadedFiles) {
      for (const file of uploadedFiles) {
        await fs.unlink(file.path).catch(() => {});
      }
    }
    return res.status(500).json({ error: err.message || 'Erro no upload de arquivos.' });
  }
});

// 12. Extrair arquivo .zip no servidor
router.post('/:id/files/extract', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { zipPath, targetPath = '' } = req.body;

  if (!zipPath) {
    return res.status(400).json({ error: 'Caminho do arquivo ZIP é obrigatório.' });
  }

  try {
    const result = await siteFilesService.extractZip(id, zipPath, targetPath);
    return res.json({
      success: true,
      message: `${result.extractedCount} arquivo(s) extraído(s) com sucesso.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao extrair arquivo ZIP.' });
  }
});

// 13. Download de arquivo individual ou pasta como ZIP
router.get('/:id/files/download', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const itemPath = (req.query.path as string) || '';

  try {
    const fullPath = siteFilesService.resolveSafePath(id, itemPath);
    const stat = await fs.stat(fullPath);

    if (stat.isDirectory()) {
      const { buffer, zipName } = await siteFilesService.createZipArchive(id, itemPath);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
      return res.send(buffer);
    } else {
      const fileName = path.basename(fullPath);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.sendFile(fullPath);
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao baixar arquivo.' });
  }
});

export default router;
