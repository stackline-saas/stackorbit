import { Router } from 'express';
import { prisma, logAudit } from '../db.js';
import { traefikService } from '../services/traefik.service.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const settings = await prisma.appSettings.findFirst({ where: { id: 'default' } });
    return res.json(settings);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao buscar configurações: ${err.message}` });
  }
});

router.put('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const {
    mainDomain,
    originServerIp,
    originHttpsPort,
    cloudflareSslMode,
    dockerSocketPath,
    traefikDynamicConfigPath,
    autoApplyTraefik,
    defaultFallbackEnabled,
  } = req.body;

  try {
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
