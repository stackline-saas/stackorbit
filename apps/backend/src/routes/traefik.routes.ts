import { Router } from 'express';
import { prisma, logAudit } from '../db.js';
import { traefikService } from '../services/traefik.service.js';
import { dockerService } from '../services/docker.service.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();

// 1. Preview generated dynamic configuration
router.get('/preview', requireAuth, async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  try {
    const [yaml, config] = await Promise.all([
      traefikService.generateYamlString(projectId),
      traefikService.generateConfigObject(projectId),
    ]);
    return res.json({ yaml, config, projectId });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao gerar preview do Traefik: ${err.message}` });
  }
});

// 2. Traefik config (raw file or preview)
router.get('/config', requireAuth, async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  try {
    const raw = traefikService.getRawConfig();
    const configObj = await traefikService.generateConfigObject(projectId);
    const yaml = raw.exists && !projectId ? raw.yaml : await traefikService.generateYamlString(projectId);

    return res.json({
      yaml,
      json: configObj,
      existsOnDisk: raw.exists,
      projectId,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao obter configuração do Traefik: ${err.message}` });
  }
});

// 3. Apply Traefik dynamic config physically
router.post('/apply', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await traefikService.applyConfig(req.user?.name || 'Administrador');

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'TRAEFIK_APLICADO',
      entityType: 'PROXY',
      details: `Configuração dinâmica do Traefik (revisão v${result.version}) gerada e sincronizada fisicamente no host.`,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: 'Configuração do Traefik aplicada com sucesso.',
      ...result,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao aplicar arquivo do Traefik: ${err.message}` });
  }
});

// 4. Restart Traefik container directly from UI
router.post('/restart', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const docker = await dockerService.getClient();
    const candidateNames = ['stackorbit-traefik', 'traefik', 'domain-manager-traefik'];
    for (const name of candidateNames) {
      try {
        const container = docker.getContainer(name);
        await container.restart();
        await logAudit({
          userId: req.user?.id,
          userName: req.user?.name || 'Administrador',
          action: 'TRAEFIK_REINICIADO',
          entityType: 'PROXY',
          details: `Container do Traefik (${name}) reiniciado com sucesso via interface web.`,
          ipAddress: req.ip,
        });
        return res.json({ success: true, message: `Traefik (${name}) reiniciado com sucesso.` });
      } catch {}
    }
    return res.status(404).json({ error: 'Container do Traefik não localizado no Docker.' });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao reiniciar Traefik: ${err.message}` });
  }
});

// 5. Traefik revisions history
router.get('/revisions', requireAuth, async (req, res) => {
  try {
    const revisions = await prisma.proxyConfiguration.findMany({
      orderBy: { appliedAt: 'desc' },
      take: 20,
    });
    return res.json(revisions);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao buscar revisões: ${err.message}` });
  }
});

export default router;
