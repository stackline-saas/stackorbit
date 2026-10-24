import { Router } from 'express';
import { prisma, logAudit } from '../db.js';

export const integrationsRouter = Router();

// Helper to get active GitHub token
async function getGitHubProvider(providerId?: string) {
  if (providerId) {
    const p = await (prisma as any).gitProvider.findUnique({ where: { id: providerId } });
    if (p && p.isActive) return p;
  }
  return await (prisma as any).gitProvider.findFirst({
    where: { provider: 'github', isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
}

// -----------------------------------------------------------------------------
// 1. LIST CONNECTED PROVIDERS
// -----------------------------------------------------------------------------
integrationsRouter.get('/providers', async (req, res) => {
  try {
    const providers = await (prisma as any).gitProvider.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const sanitized = providers.map((p: any) => ({
      id: p.id,
      provider: p.provider,
      name: p.name,
      accountName: p.accountName,
      accountUrl: p.accountUrl,
      avatarUrl: p.avatarUrl,
      tokenType: p.tokenType,
      scopes: p.scopes,
      metadata: p.metadata ? JSON.parse(p.metadata) : null,
      isActive: p.isActive,
      tokenMasked: p.accessToken ? `••••••••${p.accessToken.slice(-4)}` : null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return res.json(sanitized);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 2. CONNECT GITHUB VIA PERSONAL ACCESS TOKEN (PAT)
// -----------------------------------------------------------------------------
integrationsRouter.post('/github/connect-pat', async (req, res) => {
  try {
    const { token, name } = req.body;
    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'Token de Acesso Pessoal (PAT) é obrigatório.' });
    }

    const cleanToken = token.trim();

    // Validate token against GitHub API
    const ghRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'DockerDomainManager/1.0',
      },
    });

    if (!ghRes.ok) {
      if (ghRes.status === 401) {
        return res.status(401).json({ error: 'Token do GitHub inválido ou expirado.' });
      }
      return res.status(ghRes.status).json({
        error: `Falha na autenticação com GitHub (HTTP ${ghRes.status}).`,
      });
    }

    const ghUser = (await ghRes.json()) as any;
    const scopes = ghRes.headers.get('x-oauth-scopes') || 'repo,read:user';

    // Upsert or create provider record
    const existing = await (prisma as any).gitProvider.findFirst({
      where: { provider: 'github', accountName: ghUser.login },
    });

    let providerRecord;
    if (existing) {
      providerRecord = await (prisma as any).gitProvider.update({
        where: { id: existing.id },
        data: {
          name: name?.trim() || ghUser.name || ghUser.login,
          accountName: ghUser.login,
          accountUrl: ghUser.html_url,
          avatarUrl: ghUser.avatar_url,
          accessToken: cleanToken,
          tokenType: 'pat',
          scopes,
          metadata: JSON.stringify({
            publicRepos: ghUser.public_repos,
            privateRepos: ghUser.total_private_repos || 0,
            email: ghUser.email,
          }),
          isActive: true,
          updatedAt: new Date(),
        },
      });
    } else {
      providerRecord = await (prisma as any).gitProvider.create({
        data: {
          provider: 'github',
          name: name?.trim() || ghUser.name || ghUser.login,
          accountName: ghUser.login,
          accountUrl: ghUser.html_url,
          avatarUrl: ghUser.avatar_url,
          accessToken: cleanToken,
          tokenType: 'pat',
          scopes,
          metadata: JSON.stringify({
            publicRepos: ghUser.public_repos,
            privateRepos: ghUser.total_private_repos || 0,
            email: ghUser.email,
          }),
          isActive: true,
        },
      });
    }

    await logAudit({
      userId: (req as any).user?.id,
      userName: (req as any).user?.name || 'Admin',
      action: 'CONNECT_GIT_PROVIDER',
      entityType: 'SETTINGS',
      entityId: providerRecord.id,
      details: `Conectou conta do GitHub @${ghUser.login} via PAT.`,
      ipAddress: req.ip,
    });

    return res.status(201).json({
      id: providerRecord.id,
      provider: providerRecord.provider,
      name: providerRecord.name,
      accountName: providerRecord.accountName,
      accountUrl: providerRecord.accountUrl,
      avatarUrl: providerRecord.avatarUrl,
      scopes: providerRecord.scopes,
      tokenType: providerRecord.tokenType,
      isActive: providerRecord.isActive,
      tokenMasked: `••••••••${cleanToken.slice(-4)}`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 3. GITHUB OAUTH URL & CALLBACK
// -----------------------------------------------------------------------------
integrationsRouter.get('/github/oauth-url', (req, res) => {
  const clientId = (req.query.clientId as string) || process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(400).json({
      error: 'GITHUB_CLIENT_ID não configurado no servidor ou na requisição.',
    });
  }

  const redirectUri =
    (req.query.redirectUri as string) ||
    `${req.protocol}://${req.get('host')}/api/integrations/github/callback`;
  const scopes = 'repo,read:user,admin:repo_hook';
  const state = Math.random().toString(36).substring(2);

  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=${encodeURIComponent(scopes)}&state=${state}`;

  return res.json({ url, state });
});

integrationsRouter.post('/github/oauth-callback', async (req, res) => {
  try {
    const { code, clientId, clientSecret, redirectUri } = req.body;
    const finalClientId = clientId || process.env.GITHUB_CLIENT_ID;
    const finalSecret = clientSecret || process.env.GITHUB_CLIENT_SECRET;

    if (!code || !finalClientId || !finalSecret) {
      return res.status(400).json({
        error: 'Parâmetros code, clientId e clientSecret são necessários para autenticação OAuth.',
      });
    }

    // Exchange code for token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'DockerDomainManager/1.0',
      },
      body: JSON.stringify({
        client_id: finalClientId,
        client_secret: finalSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = (await tokenRes.json()) as any;
    if (!tokenRes.ok || tokenData.error) {
      return res.status(400).json({
        error: tokenData.error_description || tokenData.error || 'Falha ao trocar código OAuth.',
      });
    }

    const accessToken = tokenData.access_token;

    // Fetch user details
    const ghRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'DockerDomainManager/1.0',
      },
    });

    const ghUser = (await ghRes.json()) as any;
    const scopes = tokenData.scope || ghRes.headers.get('x-oauth-scopes') || 'repo,read:user';

    const providerRecord = await (prisma as any).gitProvider.create({
      data: {
        provider: 'github',
        name: ghUser.name || ghUser.login,
        accountName: ghUser.login,
        accountUrl: ghUser.html_url,
        avatarUrl: ghUser.avatar_url,
        accessToken,
        tokenType: 'oauth',
        scopes,
        metadata: JSON.stringify({
          publicRepos: ghUser.public_repos,
          privateRepos: ghUser.total_private_repos || 0,
        }),
        isActive: true,
      },
    });

    return res.status(201).json(providerRecord);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 4. DISCONNECT / REMOVE PROVIDER
// -----------------------------------------------------------------------------
integrationsRouter.delete('/providers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await (prisma as any).gitProvider.delete({ where: { id } });

    await logAudit({
      userId: (req as any).user?.id,
      userName: (req as any).user?.name || 'Admin',
      action: 'DISCONNECT_GIT_PROVIDER',
      entityType: 'SETTINGS',
      entityId: id,
      details: `Desconectou provedor Git ID: ${id}`,
      ipAddress: req.ip,
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 5. LIST REPOSITORIES FOR CONNECTED PROVIDER
// -----------------------------------------------------------------------------
integrationsRouter.get('/github/repos', async (req, res) => {
  try {
    const providerId = req.query.providerId as string | undefined;
    const searchQuery = ((req.query.q as string) || '').toLowerCase().trim();

    const provider = await getGitHubProvider(providerId);
    if (!provider) {
      return res.status(404).json({
        error: 'Nenhuma conta do GitHub conectada. Conecte sua conta em Integrações.',
      });
    }

    // Fetch up to 100 recent repos
    const ghRes = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
      {
        headers: {
          Authorization: `Bearer ${provider.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'DockerDomainManager/1.0',
        },
      }
    );

    if (!ghRes.ok) {
      if (ghRes.status === 401) {
        return res.status(401).json({
          error: 'Token do GitHub expirado ou revogado. Reconecte a conta em Integrações.',
        });
      }
      return res.status(ghRes.status).json({
        error: `Erro da API do GitHub: HTTP ${ghRes.status}`,
      });
    }

    let repos = (await ghRes.json()) as any[];

    if (searchQuery) {
      repos = repos.filter(
        (r: any) =>
          r.name?.toLowerCase().includes(searchQuery) ||
          r.full_name?.toLowerCase().includes(searchQuery) ||
          r.description?.toLowerCase().includes(searchQuery)
      );
    }

    const mapped = repos.map((r: any) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner?.login,
      ownerAvatar: r.owner?.avatar_url,
      private: r.private,
      htmlUrl: r.html_url,
      cloneUrl: r.clone_url,
      defaultBranch: r.default_branch || 'main',
      description: r.description,
      language: r.language,
      updatedAt: r.updated_at,
      stars: r.stargazers_count,
    }));

    return res.json({
      provider: {
        id: provider.id,
        accountName: provider.accountName,
        avatarUrl: provider.avatarUrl,
      },
      repositories: mapped,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 6. LIST BRANCHES AND TAGS FOR A REPO
// -----------------------------------------------------------------------------
integrationsRouter.get('/github/repos/:owner/:repo/branches', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const providerId = req.query.providerId as string | undefined;

    const provider = await getGitHubProvider(providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Nenhuma conta do GitHub conectada.' });
    }

    const headers = {
      Authorization: `Bearer ${provider.accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'DockerDomainManager/1.0',
    };

    const [branchesRes, tagsRes, repoRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, { headers }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/tags?per_page=50`, { headers }),
      fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
    ]);

    const branches = branchesRes.ok ? (((await branchesRes.json()) as any[]) || []) : [];
    const tags = tagsRes.ok ? (((await tagsRes.json()) as any[]) || []) : [];
    const repoInfo = repoRes.ok ? (((await repoRes.json()) as any) || null) : null;

    return res.json({
      defaultBranch: repoInfo?.default_branch || 'main',
      branches: branches.map((b: any) => ({ name: b.name, commitHash: b.commit?.sha })),
      tags: tags.map((t: any) => ({ name: t.name, commitHash: t.commit?.sha })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 7. INSPECT REPOSITORY: DETECT DOCKERFILE, CONTEXT & RECOMMENDED PORT
// -----------------------------------------------------------------------------
integrationsRouter.get('/github/repos/:owner/:repo/inspect', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const branch = (req.query.branch as string) || 'main';
    const providerId = req.query.providerId as string | undefined;

    const provider = await getGitHubProvider(providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Nenhuma conta do GitHub conectada.' });
    }

    const headers = {
      Authorization: `Bearer ${provider.accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'DockerDomainManager/1.0',
    };

    // Get tree of repository to find Dockerfile and config files
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers }
    );

    let detectedDockerfile = 'Dockerfile';
    let detectedComposeFile = 'docker-compose.yml';
    let suggestedBuildContext = '.';
    let suggestedPort = 3000;
    let detectedType = 'Docker';
    let hasDockerfile = false;
    let hasCompose = false;
    let composeCandidates: string[] = [];
    let dockerfileCandidates: string[] = [];
    let envCandidates: string[] = [];

    if (treeRes.ok) {
      const treeData = (await treeRes.json()) as any;
      const files: string[] = (treeData.tree || []).map((item: any) => item.path);

      // 1. Search for Docker Compose files
      composeCandidates = files.filter(
        (f) =>
          f === 'docker-compose.yml' ||
          f === 'docker-compose.yaml' ||
          f === 'compose.yml' ||
          f === 'compose.yaml' ||
          f.endsWith('/docker-compose.yml') ||
          f.endsWith('/docker-compose.yaml') ||
          f.endsWith('/compose.yml') ||
          f.endsWith('/compose.yaml')
      );

      if (composeCandidates.length > 0) {
        hasCompose = true;
        const rootCompose = composeCandidates.find((f) => f === 'docker-compose.yml' || f === 'compose.yml');
        detectedComposeFile = rootCompose || composeCandidates[0];
      }

      // 2. Search for Dockerfile
      dockerfileCandidates = files.filter(
        (f) =>
          f === 'Dockerfile' ||
          f.endsWith('/Dockerfile') ||
          f.toLowerCase().includes('dockerfile')
      );

      if (dockerfileCandidates.length > 0) {
        hasDockerfile = true;
        // Prioritize root Dockerfile, otherwise first candidate
        const rootDf = dockerfileCandidates.find((f) => f === 'Dockerfile');
        if (rootDf) {
          detectedDockerfile = 'Dockerfile';
          suggestedBuildContext = '.';
        } else {
          detectedDockerfile = dockerfileCandidates[0];
          const parts = detectedDockerfile.split('/');
          parts.pop(); // remove 'Dockerfile'
          suggestedBuildContext = parts.length > 0 ? parts.join('/') : '.';
        }
      }

      // Set detected type
      if (hasCompose) {
        detectedType = 'Docker Compose Stack';
      }

      // 3. Search for .env files
      envCandidates = files
        .filter((f) => {
          const lower = f.toLowerCase();
          const base = f.includes('/') ? f.split('/').pop()!.toLowerCase() : lower;
          return (
            base.startsWith('.env') ||
            base.endsWith('.env') ||
            base === 'env.example' ||
            base === 'env.sample' ||
            base === 'env.production' ||
            base === 'env.local' ||
            base.includes('.env.')
          );
        })
        .sort((a, b) => {
          const priority = (name: string) => {
            const lower = name.toLowerCase();
            if (lower.includes('example')) return 1;
            if (lower.includes('sample')) return 2;
            if (lower.includes('prod')) return 3;
            if (lower.includes('default')) return 4;
            if (lower === '.env') return 5;
            return 6;
          };
          return priority(a) - priority(b);
        });

      // 4. Detect project type and suggest port
      if (files.some((f) => f === 'package.json' || f.endsWith('/package.json'))) {
        detectedType = 'Node.js / JavaScript';
        suggestedPort = 3000;

        // Try reading package.json to see if a port or framework is mentioned
        try {
          const pkgRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/package.json?ref=${encodeURIComponent(branch)}`,
            { headers }
          );
          if (pkgRes.ok) {
            const pkgData = (await pkgRes.json()) as any;
            const content = Buffer.from(pkgData.content, 'base64').toString('utf8');
            const pkgJson = JSON.parse(content);
            if (pkgJson.dependencies?.next || pkgJson.devDependencies?.next) {
              detectedType = 'Next.js App';
              suggestedPort = 3000;
            } else if (pkgJson.dependencies?.['@nestjs/core']) {
              detectedType = 'NestJS Backend';
              suggestedPort = 3000;
            } else if (pkgJson.dependencies?.vite || pkgJson.devDependencies?.vite) {
              detectedType = 'Vite / Single Page App';
              suggestedPort = 80;
            }
          }
        } catch {}
      } else if (files.some((f) => f === 'requirements.txt' || f === 'pyproject.toml')) {
        detectedType = 'Python';
        suggestedPort = 8000;
      } else if (files.some((f) => f === 'go.mod')) {
        detectedType = 'Go Application';
        suggestedPort = 8080;
      } else if (files.some((f) => f === 'pom.xml' || f === 'build.gradle')) {
        detectedType = 'Java / Spring';
        suggestedPort = 8080;
      } else if (files.some((f) => f === 'nginx.conf')) {
        detectedType = 'Nginx / Static';
        suggestedPort = 80;
      }
    }

    return res.json({
      hasCompose,
      detectedComposeFile,
      composeCandidates,
      hasDockerfile,
      detectedDockerfile,
      dockerfileCandidates,
      envCandidates,
      definitionType: hasCompose ? 'compose' : 'dockerfile',
      suggestedDefinitionFile: hasCompose ? detectedComposeFile : detectedDockerfile,
      suggestedBuildContext,
      suggestedPort,
      detectedType,
      token: provider.accessToken, // pre-fills token for private repos clone
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 8. GET FILE CONTENT (FOR .ENV OR CONFIG IMPORT)
// -----------------------------------------------------------------------------
integrationsRouter.get('/github/repos/:owner/:repo/file-content', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const filePath = req.query.path as string;
    const branch = (req.query.branch as string) || 'main';
    const providerId = req.query.providerId as string | undefined;

    if (!filePath) {
      return res.status(400).json({ error: 'Parâmetro path é obrigatório.' });
    }

    const provider = await getGitHubProvider(providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Nenhuma conta do GitHub conectada.' });
    }

    const headers = {
      Authorization: `Bearer ${provider.accessToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'DockerDomainManager/1.0',
    };

    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
      { headers }
    );

    if (!fileRes.ok) {
      return res.status(fileRes.status).json({ error: `Arquivo "${filePath}" não encontrado no repositório.` });
    }

    const fileData = (await fileRes.json()) as any;
    if (!fileData.content) {
      return res.json({ content: '', path: filePath });
    }

    const content = Buffer.from(fileData.content, 'base64').toString('utf8');
    return res.json({ content, path: filePath, size: fileData.size });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
