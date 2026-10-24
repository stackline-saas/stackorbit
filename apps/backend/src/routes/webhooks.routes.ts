import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma, logAudit } from '../db.js';
import { queueService } from '../services/queue.service.js';

const router = Router();

router.post('/github/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado.' });
    }

    if (service.sourceType !== 'GITHUB' || !service.gitRepoUrl) {
      return res.status(400).json({ error: 'Serviço não está configurado para deploy via Git.' });
    }

    // Verify GitHub Webhook HMAC signature if secret configured
    if (service.webhookSecret) {
      const signature = req.headers['x-hub-signature-256'] as string;
      if (signature) {
        const rawBody = JSON.stringify(req.body);
        const expected = `sha256=${crypto.createHmac('sha256', service.webhookSecret).update(rawBody).digest('hex')}`;
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
          return res.status(401).json({ error: 'Assinatura do webhook inválida.' });
        }
      }
    }

    await prisma.service.update({
      where: { id },
      data: { buildStatus: 'cloning' },
    });

    const match = service.notes?.match(/<!--dm-meta:([\s\S]*?)-->/);
    let meta: any = {};
    if (match) {
      try { meta = JSON.parse(match[1]); } catch {}
    }

    const job = await queueService.addBuildJob({
      serviceId: service.id,
      gitRepoUrl: service.gitRepoUrl,
      gitBranch: service.gitBranch || 'main',
      dockerfilePath: service.dockerfilePath || 'Dockerfile',
      envVars: service.envVars || undefined,
      triggeredBy: 'GitHub Webhook (Push)',
      gitToken: meta.gitToken,
      buildContext: meta.buildContext,
      buildArgs: meta.buildArgs,
    });

    await logAudit({
      userName: 'GitHub Webhook',
      action: 'WEBHOOK_DEPLOY_DISPARADO',
      entityType: 'SERVICE',
      entityId: service.id,
      details: `Novo push detectado no GitHub. Build disparado automaticamente. Job ID: ${job.id}.`,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      jobId: job.id,
      message: 'Build disparado via Webhook com sucesso.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro no processamento do webhook: ${err.message}` });
  }
});

export default router;
