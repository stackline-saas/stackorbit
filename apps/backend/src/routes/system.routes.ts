import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { logAudit } from '../db.js';
import { exec } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const router = Router();

interface CachedRelease {
  tag: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  checkedAt: number;
}

let cachedRelease: CachedRelease | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

// 1. Obter informações de versão e checar se há atualização no GitHub
router.get('/version', requireAuth, async (_req, res) => {
  const currentVersion = process.env.APP_VERSION || 'v0.1.0';

  const now = Date.now();
  let latestRelease = cachedRelease;

  if (!cachedRelease || now - cachedRelease.checkedAt > CACHE_TTL_MS) {
    try {
      const ghRes = await fetch(
        'https://api.github.com/repos/vcmuniz/docker-domain/releases/latest',
        {
          headers: {
            'User-Agent': 'Docker-Domain-Manager',
            Accept: 'application/vnd.github.v3+json',
          },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (ghRes.ok) {
        const data: any = await ghRes.json();
        latestRelease = {
          tag: data.tag_name || '',
          name: data.name || data.tag_name || '',
          body: data.body || '',
          html_url: data.html_url || '',
          published_at: data.published_at || '',
          checkedAt: now,
        };
        cachedRelease = latestRelease;
      }
    } catch {
      // Fallback se não tiver internet ou se rate limit da API do GitHub estourar
    }
  }

  const latestTag = latestRelease?.tag || currentVersion;
  const updateAvailable =
    latestTag !== currentVersion &&
    latestTag.replace(/^v/, '') !== currentVersion.replace(/^v/, '');

  return res.json({
    currentVersion,
    latestVersion: latestTag,
    updateAvailable,
    releaseName: latestRelease?.name || null,
    releaseNotes: latestRelease?.body || null,
    releaseUrl: latestRelease?.html_url || null,
    publishedAt: latestRelease?.published_at || null,
  });
});

// 2. Acionar atualização da plataforma com 1 clique pela interface
router.post('/update', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'SYSTEM_UPDATE',
      entityType: 'SYSTEM',
      entityId: 'docker-domain-manager',
      details: 'Atualização do sistema iniciada pela interface web.',
      ipAddress: req.ip,
    });

    // Procura scripts de atualização no host ou aciona docker compose pull
    const isDocker = fs.existsSync('/.dockerenv');
    const updateCmd = isDocker
      ? 'docker compose -f /app/docker-compose.yml pull && docker compose -f /app/docker-compose.yml up -d'
      : 'docker compose pull && docker compose up -d';

    // Executa de forma assíncrona desacoplada para não travar o socket do Express
    setTimeout(() => {
      exec(updateCmd, { timeout: 300000 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[SystemUpdate] Erro na auto-atualização: ${error.message}`);
          return;
        }
        console.log(`[SystemUpdate] Auto-atualização finalizada: ${stdout || stderr}`);
      });
    }, 1000);

    return res.json({
      success: true,
      message: 'Atualização disparada com sucesso! O sistema baixará as imagens e reiniciará em instantes.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao acionar atualização: ${err.message}` });
  }
});

export default router;
