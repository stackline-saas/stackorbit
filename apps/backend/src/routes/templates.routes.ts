import { Router } from 'express';
import { SERVICE_TEMPLATES } from '../templates.js';
import { prisma, logAudit } from '../db.js';
import { dockerService } from '../services/docker.service.js';
import { traefikService } from '../services/traefik.service.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();

// 1. List templates
router.get('/', requireAuth, (req, res) => {
  return res.json(SERVICE_TEMPLATES);
});

// 2. Deploy template
router.post('/deploy', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { templateId, serviceName, containerName, values, domainName, projectId, dockerHostId } = req.body;

  const template = SERVICE_TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    return res.status(404).json({ error: 'Template não encontrado.' });
  }

  const cleanContainerName = (containerName || template.defaultContainerName).trim();
  const cleanServiceName = (serviceName || template.name).trim();

  try {
    const existing = await prisma.service.findUnique({ where: { containerName: cleanContainerName } });
    if (existing) {
      return res.status(409).json({ error: `Já existe um serviço com o containerName "${cleanContainerName}".` });
    }

    const envVars = template.generateEnv(values || {});
    const command = template.generateCommand ? template.generateCommand(values || {}).trim() || undefined : undefined;
    const connectionString = template.generateConnectionString
      ? template.generateConnectionString(values || {}, cleanContainerName)
      : undefined;

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

    // Create service
    const service = await prisma.service.create({
      data: {
        name: cleanServiceName,
        containerName: cleanContainerName,
        image: template.defaultImage,
        internalPort: template.defaultPort,
        status: 'running',
        isActive: true,
        sourceType: 'IMAGE',
        command,
        envVars,
        notes: `Instalado via Template: ${template.name}`,
        projectId: finalProjectId,
        dockerHostId: finalDockerHostId,
      },
    });

    // Deploy container
    try {
      const containerId = await dockerService.deployContainer({
        containerName: cleanContainerName,
        image: template.defaultImage,
        envVars,
        command,
      });
      await prisma.service.update({ where: { id: service.id }, data: { containerId } });
    } catch (e: any) {
      console.warn(`Aviso no deploy do container do template ${template.id}:`, e.message);
    }

    // Optional domain binding
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
      action: 'TEMPLATE_DEPLOY',
      entityType: 'SERVICE',
      entityId: service.id,
      details: `Template "${template.name}" implantado com container "${cleanContainerName}".`,
      ipAddress: req.ip,
    });

    return res.status(201).json({
      service,
      domain: domainCreated,
      connectionString,
      message: `Template "${template.name}" implantado com sucesso.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro no deploy do template: ${err.message}` });
  }
});

export default router;
