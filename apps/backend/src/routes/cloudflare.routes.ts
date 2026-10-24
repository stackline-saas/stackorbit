import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { prisma, logAudit } from '../db.js';
import { config } from '../config.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();

function getCertStatus() {
  const certPath = path.resolve(config.traefikCertsDir, 'origin.pem');
  const keyPath = path.resolve(config.traefikCertsDir, 'origin.key');

  const certExists = fs.existsSync(certPath);
  const keyExists = fs.existsSync(keyPath);

  let certDetails = null;
  if (certExists) {
    const stat = fs.statSync(certPath);
    certDetails = {
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      path: certPath,
    };
  }

  return {
    isConfigured: certExists && keyExists,
    certExists,
    keyExists,
    certDetails,
  };
}

// 1. Get SSL Origin Status
router.get('/status', requireAuth, (req, res) => {
  return res.json(getCertStatus());
});

// 2. Cloudflare settings & status
router.get('/', requireAuth, async (req, res) => {
  try {
    const settings = await prisma.appSettings.findFirst({ where: { id: 'default' } });
    const status = getCertStatus();

    return res.json({
      mainDomain: settings?.mainDomain || 'meudominio.com.br',
      originServerIp: settings?.originServerIp || '127.0.0.1',
      originHttpsPort: settings?.originHttpsPort || 443,
      cloudflareSslMode: settings?.cloudflareSslMode || 'Full (strict)',
      sslConfigured: status.isConfigured,
      certStatus: status,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao obter configurações Cloudflare: ${err.message}` });
  }
});

// 3. Update Cloudflare settings
router.put('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { mainDomain, originServerIp, originHttpsPort, cloudflareSslMode } = req.body;

  try {
    const updated = await prisma.appSettings.upsert({
      where: { id: 'default' },
      update: {
        mainDomain: mainDomain?.trim() || undefined,
        originServerIp: originServerIp?.trim() || undefined,
        originHttpsPort: originHttpsPort ? Number(originHttpsPort) : undefined,
        cloudflareSslMode: cloudflareSslMode || undefined,
      },
      create: {
        id: 'default',
        mainDomain: mainDomain?.trim() || 'meudominio.com.br',
        originServerIp: originServerIp?.trim() || '127.0.0.1',
        originHttpsPort: originHttpsPort ? Number(originHttpsPort) : 443,
        cloudflareSslMode: cloudflareSslMode || 'Full (strict)',
      },
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'SETTINGS_CLOUDFLARE_ATUALIZADAS',
      entityType: 'SETTINGS',
      details: `Configurações de SSL/Cloudflare atualizadas. Modo: ${updated.cloudflareSslMode}.`,
      ipAddress: req.ip,
    });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao salvar configurações: ${err.message}` });
  }
});

// 4. Save Origin CA Certificate & Key
router.post('/origin-cert', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { certPem, keyPem } = req.body;

  if (!certPem || !keyPem) {
    return res.status(400).json({ error: 'Certificado (PEM) e Chave Privada (KEY) são obrigatórios.' });
  }

  try {
    if (!fs.existsSync(config.traefikCertsDir)) {
      fs.mkdirSync(config.traefikCertsDir, { recursive: true });
    }

    const certPath = path.resolve(config.traefikCertsDir, 'origin.pem');
    const keyPath = path.resolve(config.traefikCertsDir, 'origin.key');

    fs.writeFileSync(certPath, certPem.trim() + '\n', 'utf-8');
    fs.writeFileSync(keyPath, keyPem.trim() + '\n', 'utf-8');

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'CLOUDFLARE_ORIGIN_CERT_SALVO',
      entityType: 'SETTINGS',
      details: 'Novos certificados Cloudflare Origin CA gravados em disco para o Traefik.',
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: 'Certificado e Chave gravados com sucesso.',
      status: getCertStatus(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao salvar certificados: ${err.message}` });
  }
});

export default router;
