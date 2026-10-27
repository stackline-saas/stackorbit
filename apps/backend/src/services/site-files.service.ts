import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import AdmZip from 'adm-zip';
import type { SiteFile } from '@stackorbit/shared';
import { prisma } from '../db.js';
import { parseServiceMetadata } from '../routes/services.routes.js';

export class SiteFilesService {
  /**
   * Obtém o caminho base no sistema de arquivos para os arquivos de um site ou serviço.
   */
  public getSiteRootDir(serviceId: string): string {
    // Em produção Linux, usa /opt/stackorbit/data/sites/:id
    // Em desenvolvimento ou Windows, usa ./apps/backend/data/sites/:id de forma consistente
    const isInsideAppsBackend = process.cwd().endsWith('apps\\backend') || process.cwd().endsWith('apps/backend');
    const projectRoot = isInsideAppsBackend ? path.resolve(process.cwd(), '..', '..') : process.cwd();
    const baseStorage =
      process.platform === 'win32'
        ? path.resolve(projectRoot, 'apps', 'backend', 'data', 'sites')
        : '/opt/stackorbit/data/sites';

    const siteDir = path.join(baseStorage, serviceId);
    if (!fsSync.existsSync(siteDir)) {
      fsSync.mkdirSync(siteDir, { recursive: true });
    }
    return siteDir;
  }

  /**
   * Sincroniza automaticamente os arquivos locais do site com o container em execução.
   */
  public async syncFilesToContainer(serviceId: string): Promise<void> {
    try {
      const service = await prisma.service.findUnique({ where: { id: serviceId } });
      if (!service || !service.containerName) return;

      const { meta } = parseServiceMetadata(service.notes);
      const isStatic = (service.notes || '').toLowerCase().includes('site estático') || meta.siteType === 'STATIC';
      const docRoot = meta.documentRoot || (isStatic ? '/usr/share/nginx/html' : '/var/www/html');
      const rootDir = this.getSiteRootDir(serviceId);

      if (!fsSync.existsSync(rootDir)) return;

      await new Promise<void>((resolve) => {
        const proc = spawn('docker', ['cp', `${rootDir}/.`, `${service.containerName}:${docRoot}/`], {
          shell: process.platform === 'win32',
        });
        let stderr = '';
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
          if (code !== 0) {
            console.warn(`[syncFilesToContainer] docker cp retornou código ${code}: ${stderr}`);
          }
          resolve();
        });
        proc.on('error', (err) => {
          console.warn(`[syncFilesToContainer] Falha ao invocar docker cp:`, err.message);
          resolve();
        });
      });
    } catch (err: any) {
      console.warn(`Aviso ao sincronizar arquivos para o container do site ${serviceId}:`, err.message);
    }
  }

  /**
   * Valida e resolve um caminho seguro dentro da raiz do site (previne directory traversal).
   */
  public resolveSafePath(serviceId: string, userSubPath: string = ''): string {
    const rootDir = this.getSiteRootDir(serviceId);
    // Remove query params e normaliza
    const cleanSubPath = userSubPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const targetPath = path.resolve(rootDir, cleanSubPath);

    // Garante que o caminho de destino está estritamente dentro da raiz do site
    if (!targetPath.startsWith(rootDir)) {
      throw new Error('Acesso negado: tentativa de navegação fora do diretório do site.');
    }

    return targetPath;
  }

  /**
   * Inicializa arquivos padrão para um novo site de acordo com o template.
   */
  public async seedInitialSiteFiles(serviceId: string, siteType: string, siteTitle: string = 'Meu Site'): Promise<void> {
    const rootDir = this.getSiteRootDir(serviceId);

    if (siteType === 'STATIC') {
      const indexPath = path.join(rootDir, 'index.html');
      const cssPath = path.join(rootDir, 'style.css');
      const jsPath = path.join(rootDir, 'script.js');

      if (!fsSync.existsSync(indexPath)) {
        const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${siteTitle}</title>
  <link rel="stylesheet" href="style.css">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <div class="card">
    <div class="badge">🚀 Hospedado com StackOrbit</div>
    <h1>${siteTitle}</h1>
    <p>Seu site estático ultrarrápido está publicado e funcionando perfeitamente sob o Traefik v3 com certificado SSL ativo.</p>
    
    <div class="features">
      <div class="feature-item">📁 <b>Gerenciador Web:</b> Edite este código diretamente no painel.</div>
      <div class="feature-item">🔑 <b>Acesso SFTP:</b> Suba arquivos com FileZilla na porta configurada.</div>
      <div class="feature-item">⚡ <b>Nginx Alpine:</b> Alta performance e baixo consumo de memória.</div>
    </div>

    <button id="btnClick">Testar Interatividade JS</button>
    <p id="msg" class="msg"></p>
  </div>
  <script src="script.js"></script>
</body>
</html>`;
        await fs.writeFile(indexPath, htmlContent, 'utf-8');
      }

      if (!fsSync.existsSync(cssPath)) {
        const cssContent = `* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Plus Jakarta Sans', sans-serif;
  background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
  color: #f8fafc;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.card {
  background: rgba(30, 41, 59, 0.7);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 40px;
  border-radius: 24px;
  max-width: 580px;
  text-align: center;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}
.badge {
  display: inline-block;
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.4);
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 20px;
}
h1 { font-size: 32px; font-weight: 800; margin-bottom: 14px; letter-spacing: -0.02em; }
p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
.features { text-align: left; background: rgba(15, 23, 42, 0.5); border-radius: 16px; padding: 16px 20px; margin-bottom: 24px; border: 1px solid rgba(255, 255, 255, 0.05); }
.feature-item { font-size: 14px; color: #cbd5e1; margin-bottom: 8px; }
.feature-item:last-child { margin-bottom: 0; }
button {
  background: #2563eb;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
button:hover { background: #1d4ed8; transform: translateY(-1px); }
.msg { margin-top: 16px; color: #34d399; font-weight: 600; min-height: 20px; }`;
        await fs.writeFile(cssPath, cssContent, 'utf-8');
      }

      if (!fsSync.existsSync(jsPath)) {
        const jsContent = `document.getElementById('btnClick').addEventListener('click', () => {
  const msg = document.getElementById('msg');
  msg.innerText = '✨ JavaScript executando com sucesso! Horário: ' + new Date().toLocaleTimeString();
});`;
        await fs.writeFile(jsPath, jsContent, 'utf-8');
      }
    } else if (siteType === 'PHP') {
      const phpPath = path.join(rootDir, 'index.php');
      if (!fsSync.existsSync(phpPath)) {
        const phpContent = `<?php
$siteTitle = "${siteTitle}";
$phpVersion = phpversion();
$hostname = gethostname();
$serverSoftware = $_SERVER['SERVER_SOFTWARE'] ?? 'Apache/PHP';
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title><?= htmlspecialchars($siteTitle) ?></title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0b1120; color: #f8fafc; padding: 40px; display: flex; justify-content: center; }
    .box { background: #1e293b; border: 1px solid #334155; padding: 32px; border-radius: 20px; max-width: 600px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    h1 { margin-top: 0; color: #38bdf8; }
    .badge { background: #0369a1; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: bold; }
    table { width: 100%; margin-top: 20px; border-collapse: collapse; }
    td { padding: 10px 0; border-bottom: 1px solid #334155; font-size: 14px; }
    td.label { color: #94a3b8; font-weight: 600; width: 40%; }
    td.val { color: #f1f5f9; font-family: monospace; }
  </style>
</head>
<body>
  <div class="box">
    <span class="badge">PHP Dinâmico</span>
    <h1><?= htmlspecialchars($siteTitle) ?></h1>
    <p style="color: #94a3b8;">Ambiente PHP dinâmico ativo no StackOrbit com suporte a SQLite, PDO e gerenciador de arquivos.</p>
    <table>
      <tr><td class="label">Versão do PHP:</td><td class="val"><?= $phpVersion ?></td></tr>
      <tr><td class="label">Servidor Web:</td><td class="val"><?= htmlspecialchars($serverSoftware) ?></td></tr>
      <tr><td class="label">Container Hostname:</td><td class="val"><?= htmlspecialchars($hostname) ?></td></tr>
      <tr><td class="label">Data / Hora:</td><td class="val"><?= date('Y-m-d H:i:s') ?></td></tr>
    </table>
  </div>
</body>
</html>`;
        await fs.writeFile(phpPath, phpContent, 'utf-8');
      }
    }
  }

  /**
   * Lista arquivos e subpastas de um diretório do site.
   */
  public async listFiles(serviceId: string, subPath: string = ''): Promise<{ currentPath: string; files: SiteFile[] }> {
    const targetDir = this.resolveSafePath(serviceId, subPath);
    const rootDir = this.getSiteRootDir(serviceId);

    const relativeCurrent = path.relative(rootDir, targetDir).replace(/\\/g, '/');
    const currentPath = relativeCurrent ? `/${relativeCurrent}` : '/';

    const entries = await fs.readdir(targetDir, { withFileTypes: true });

    const files: SiteFile[] = [];
    for (const entry of entries) {
      const fullPath = path.join(targetDir, entry.name);
      const isDir = entry.isDirectory();
      let size = 0;
      let mtime = new Date().toISOString();

      try {
        const stats = await fs.stat(fullPath);
        size = stats.size;
        mtime = stats.mtime.toISOString();
      } catch {
        // Ignora erros de stat em links quebrados
      }

      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      const ext = isDir ? '' : path.extname(entry.name).toLowerCase();

      files.push({
        name: entry.name,
        path: `/${relPath}`,
        isDirectory: isDir,
        size,
        mtime,
        extension: ext,
      });
    }

    // Ordena: pastas primeiro, depois arquivos em ordem alfabetica
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return { currentPath, files };
  }

  /**
   * Lê o conteúdo de texto de um arquivo.
   */
  public async readFile(serviceId: string, filePath: string): Promise<string> {
    const fullPath = this.resolveSafePath(serviceId, filePath);
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      throw new Error('O caminho especificado é um diretório, não um arquivo.');
    }
    // Limite de 5MB para edição direta no navegador
    if (stat.size > 5 * 1024 * 1024) {
      throw new Error('Arquivo muito grande para edição no navegador (limite: 5MB).');
    }
    return await fs.readFile(fullPath, 'utf-8');
  }

  /**
   * Salva o conteúdo de texto de um arquivo.
   */
  public async writeFile(serviceId: string, filePath: string, content: string): Promise<void> {
    const fullPath = this.resolveSafePath(serviceId, filePath);
    const parentDir = path.dirname(fullPath);
    if (!fsSync.existsSync(parentDir)) {
      await fs.mkdir(parentDir, { recursive: true });
    }
    await fs.writeFile(fullPath, content, 'utf-8');
    await this.syncFilesToContainer(serviceId);
  }

  /**
   * Cria um novo arquivo vazio.
   */
  public async createFile(serviceId: string, filePath: string, initialContent: string = ''): Promise<void> {
    const fullPath = this.resolveSafePath(serviceId, filePath);
    if (fsSync.existsSync(fullPath)) {
      throw new Error('Um arquivo ou pasta com este nome já existe.');
    }
    const parentDir = path.dirname(fullPath);
    if (!fsSync.existsSync(parentDir)) {
      await fs.mkdir(parentDir, { recursive: true });
    }
    await fs.writeFile(fullPath, initialContent, 'utf-8');
    await this.syncFilesToContainer(serviceId);
  }

  /**
   * Cria uma nova pasta.
   */
  public async createDirectory(serviceId: string, dirPath: string): Promise<void> {
    const fullPath = this.resolveSafePath(serviceId, dirPath);
    if (fsSync.existsSync(fullPath)) {
      throw new Error('Já existe um item com este nome.');
    }
    await fs.mkdir(fullPath, { recursive: true });
    await this.syncFilesToContainer(serviceId);
  }

  /**
   * Exclui um arquivo ou pasta recursivamente.
   */
  public async deleteItem(serviceId: string, itemPath: string): Promise<void> {
    const fullPath = this.resolveSafePath(serviceId, itemPath);
    const rootDir = this.getSiteRootDir(serviceId);
    if (fullPath === rootDir) {
      throw new Error('Não é permitido excluir o diretório raiz do site.');
    }
    await fs.rm(fullPath, { recursive: true, force: true });
    await this.syncFilesToContainer(serviceId);
  }

  /**
   * Renomeia ou move um arquivo ou pasta.
   */
  public async renameItem(serviceId: string, oldPath: string, newPath: string): Promise<void> {
    const src = this.resolveSafePath(serviceId, oldPath);
    const dst = this.resolveSafePath(serviceId, newPath);
    if (!fsSync.existsSync(src)) {
      throw new Error('Item de origem não encontrado.');
    }
    if (fsSync.existsSync(dst)) {
      throw new Error('Já existe um item no destino com esse nome.');
    }
    await fs.rename(src, dst);
    await this.syncFilesToContainer(serviceId);
  }

  /**
   * Extrai um arquivo .zip no diretório de destino.
   */
  public async extractZip(serviceId: string, zipRelativePath: string, targetSubPath: string = ''): Promise<{ extractedCount: number }> {
    const zipFullPath = this.resolveSafePath(serviceId, zipRelativePath);
    const targetDir = this.resolveSafePath(serviceId, targetSubPath);

    if (!fsSync.existsSync(zipFullPath)) {
      throw new Error('Arquivo ZIP não encontrado.');
    }

    const zip = new AdmZip(zipFullPath);
    zip.extractAllTo(targetDir, true);
    const entries = zip.getEntries();
    await this.syncFilesToContainer(serviceId);
    return { extractedCount: entries.length };
  }

  /**
   * Compacta um arquivo ou diretório e retorna o buffer ZIP para download.
   */
  public async createZipArchive(serviceId: string, sourcePath: string = ''): Promise<{ buffer: Buffer; zipName: string }> {
    const fullPath = this.resolveSafePath(serviceId, sourcePath);
    const stat = await fs.stat(fullPath);

    const zip = new AdmZip();
    const baseName = path.basename(fullPath) || 'site-files';

    if (stat.isDirectory()) {
      zip.addLocalFolder(fullPath);
    } else {
      zip.addLocalFile(fullPath);
    }

    const buffer = zip.toBuffer();
    return { buffer, zipName: `${baseName}.zip` };
  }
}

export const siteFilesService = new SiteFilesService();
