export async function resolveGitToken(
  prismaClient: any,
  options: {
    gitRepoUrl?: string | null;
    gitProviderId?: string | null;
    explicitToken?: string | null;
  }
): Promise<string | undefined> {
  const { gitRepoUrl, gitProviderId, explicitToken } = options;

  // 1. If an explicit unmasked token was passed and is not masked dots, use it
  if (explicitToken && !explicitToken.startsWith('••••••••') && !explicitToken.startsWith('********')) {
    return explicitToken;
  }

  try {
    // 2. If gitProviderId is specified
    if (gitProviderId) {
      const p = await prismaClient.gitProvider.findUnique({
        where: { id: gitProviderId },
      });
      if (p?.accessToken && p.isActive) {
        return p.accessToken;
      }
    }

    // 3. Match by repository owner from gitRepoUrl (e.g. https://github.com/vcmuniz/infopulse.git -> vcmuniz)
    if (gitRepoUrl) {
      const match = gitRepoUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/i);
      const owner = match ? match[1] : null;
      if (owner) {
        const providers = await prismaClient.gitProvider.findMany({
          where: { provider: 'github', isActive: true },
        });
        const matched = providers.find(
          (p: any) => p.accountName && p.accountName.toLowerCase() === owner.toLowerCase()
        );
        if (matched?.accessToken) {
          return matched.accessToken;
        }
      }
    }

    // 4. Fallback to any active GitHub provider (most recently updated)
    const fallback = await prismaClient.gitProvider.findFirst({
      where: { provider: 'github', isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (fallback?.accessToken) {
      return fallback.accessToken;
    }
  } catch (err: any) {
    console.warn('[GitTokenResolver] Erro ao resolver token do Git:', err.message);
  }

  return undefined;
}
