import { Router } from 'express';
import { prisma, logAudit } from '../db.js';
import { traefikService } from '../services/traefik.service.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  try {
    const globalSettings = await prisma.appSettings.findFirst({ where: { id: 'default' } });
    if (projectId) {
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (project) {
        return res.json({
          ...globalSettings,
          projectId: project.id,
          projectName: project.name,
          mainDomain: project.mainDomain || globalSettings?.mainDomain || 'meudominio.com.br',
          originServerIp: project.originServerIp || globalSettings?.originServerIp || '127.0.0.1',
          originHttpsPort: project.originHttpsPort || globalSettings?.originHttpsPort || 443,
          cloudflareSslMode: project.cloudflareSslMode || globalSettings?.cloudflareSslMode || 'Full (strict)',
          autoApplyTraefik: project.autoApplyTraefik ?? globalSettings?.autoApplyTraefik ?? true,
          defaultFallbackEnabled: project.defaultFallbackEnabled ?? globalSettings?.defaultFallbackEnabled ?? true,
        });
      }
    }
    return res.json(globalSettings);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao buscar configurações: ${err.message}` });
  }
});

router.put('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const {
    projectId: bodyProjectId,
    mainDomain,
    originServerIp,
    originHttpsPort,
    cloudflareSslMode,
    dockerSocketPath,
    traefikDynamicConfigPath,
    autoApplyTraefik,
    defaultFallbackEnabled,
  } = req.body;
  const projectId = bodyProjectId || (req.query.projectId as string | undefined);

  try {
    if (projectId) {
      const updatedProject = await prisma.project.update({
        where: { id: projectId },
        data: {
          mainDomain: mainDomain !== undefined ? mainDomain.trim() : undefined,
          originServerIp: originServerIp !== undefined ? originServerIp.trim() : undefined,
          originHttpsPort: originHttpsPort !== undefined ? Number(originHttpsPort) : undefined,
          cloudflareSslMode: cloudflareSslMode !== undefined ? cloudflareSslMode : undefined,
          autoApplyTraefik: autoApplyTraefik !== undefined ? Boolean(autoApplyTraefik) : undefined,
          defaultFallbackEnabled: defaultFallbackEnabled !== undefined ? Boolean(defaultFallbackEnabled) : undefined,
        },
      });

      if (updatedProject.autoApplyTraefik) {
        await traefikService.applyConfig(req.user?.name || 'Administrador');
      }

      await logAudit({
        userId: req.user?.id,
        userName: req.user?.name || 'Administrador',
        action: 'PROJECT_SETTINGS_ATUALIZADAS',
        entityType: 'PROJECT',
        entityId: projectId,
        details: `Configurações do projeto "${updatedProject.name}" atualizadas.`,
        ipAddress: req.ip,
      });

      return res.json(updatedProject);
    }

    const updated = await prisma.appSettings.upsert({
      where: { id: 'default' },
      update: {
        mainDomain: mainDomain !== undefined ? mainDomain.trim() : undefined,
        originServerIp: originServerIp !== undefined ? originServerIp.trim() : undefined,
        originHttpsPort: originHttpsPort !== undefined ? Number(originHttpsPort) : undefined,
        cloudflareSslMode: cloudflareSslMode !== undefined ? cloudflareSslMode : undefined,
        dockerSocketPath: dockerSocketPath !== undefined ? dockerSocketPath.trim() : undefined,
        traefikDynamicConfigPath: traefikDynamicConfigPath !== undefined ? traefikDynamicConfigPath.trim() : undefined,
        autoApplyTraefik: autoApplyTraefik !== undefined ? Boolean(autoApplyTraefik) : undefined,
        defaultFallbackEnabled: defaultFallbackEnabled !== undefined ? Boolean(defaultFallbackEnabled) : undefined,
      },
      create: {
        id: 'default',
        mainDomain: mainDomain?.trim() || 'meudominio.com.br',
        originServerIp: originServerIp?.trim() || '127.0.0.1',
        originHttpsPort: originHttpsPort ? Number(originHttpsPort) : 443,
        cloudflareSslMode: cloudflareSslMode || 'Full (strict)',
        dockerSocketPath: dockerSocketPath?.trim() || '/var/run/docker.sock',
        traefikDynamicConfigPath: traefikDynamicConfigPath?.trim() || './traefik/dynamic/dynamic_conf.yml',
        autoApplyTraefik: autoApplyTraefik !== undefined ? Boolean(autoApplyTraefik) : true,
        defaultFallbackEnabled: defaultFallbackEnabled !== undefined ? Boolean(defaultFallbackEnabled) : true,
      },
    });

    if (updated.autoApplyTraefik) {
      await traefikService.applyConfig(req.user?.name || 'Administrador');
    }

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'SETTINGS_ATUALIZADAS',
      entityType: 'SETTINGS',
      details: 'Parâmetros globais do sistema atualizados.',
      ipAddress: req.ip,
    });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao salvar configurações: ${err.message}` });
  }
});

export default router;
