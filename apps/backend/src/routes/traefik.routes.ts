import { Router } from 'express';
import { prisma, logAudit } from '../db.js';
import { traefikService } from '../services/traefik.service.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();

// 1. Preview generated dynamic configuration
router.get('/preview', requireAuth, async (req, res) => {
  try {
    const [yaml, config] = await Promise.all([
      traefikService.generateYamlString(),
      traefikService.generateConfigObject(),
    ]);
    return res.json({ yaml, config });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao gerar preview do Traefik: ${err.message}` });
  }
});

// 2. Traefik config (raw file or preview)
router.get('/config', requireAuth, async (req, res) => {
  try {
    const raw = traefikService.getRawConfig();
    const configObj = await traefikService.generateConfigObject();
    const yaml = raw.exists ? raw.yaml : await traefikService.generateYamlString();

    return res.json({
      yaml,
      json: configObj,
      existsOnDisk: raw.exists,
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

// 4. Traefik revisions history
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
