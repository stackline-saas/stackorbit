import { Router } from 'express';
import { prisma } from '../db.js';
import { dockerService } from '../services/docker.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const [services, domains, containers, dockerStatus, recentAudit, lastProxyConfig, settings] =
      await Promise.all([
        prisma.service.findMany(),
        prisma.domain.findMany(),
        dockerService.listContainers(),
        dockerService.getStatus(),
        prisma.auditLog.findMany({
          take: 8,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.proxyConfiguration.findFirst({
          orderBy: { appliedAt: 'desc' },
        }),
        prisma.appSettings.findFirst({
          where: { id: 'default' },
        }),
      ]);

    const defaultService = services.find((s) => s.isDefault);

    const stats = {
      totalServices: services.length,
      activeServices: services.filter((s) => s.isActive).length,
      totalDomains: domains.length,
      activeDomains: domains.filter((d) => d.isActive).length,
      runningContainers: containers.filter((c) => c.status === 'running').length,
      stoppedContainers: containers.filter((c) => c.status !== 'running').length,
      defaultServiceName: defaultService ? defaultService.name : null,
      defaultServiceId: defaultService ? defaultService.id : null,
      dockerConnected: dockerStatus.connected,
      dockerSocketPath: dockerStatus.socketPath,
      dockerEngineVersion: dockerStatus.version || '27.1.1',
      dockerIsEmulated: dockerStatus.isEmulated,
      recentAuditLogs: recentAudit,
      lastProxyConfigAppliedAt: lastProxyConfig?.appliedAt?.toISOString(),
      mainDomain: settings?.mainDomain || 'meudominio.com.br',
    };

    return res.json(stats);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao obter estatísticas do dashboard: ${err.message}` });
  }
});

export default router;
