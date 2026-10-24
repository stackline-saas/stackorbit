import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  CheckCircle2,
  AlertCircle,
  Key,
  ExternalLink,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  ShieldCheck,
  Package,
  Layers,
  Sparkles,
  Lock,
  ArrowRight,
  Globe,
  Clock,
  Check,
} from 'lucide-react';
import type { GitProviderAccount } from '../../types/index.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useNotification } from '../../context/NotificationContext.tsx';

export const IntegrationsView: React.FC = () => {
  const { authFetch } = useAuth();
  const { showNotification } = useNotification();

  const [providers, setProviders] = useState<GitProviderAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Form states for PAT connect
  const [patToken, setPatToken] = useState('');
  const [patAccountName, setPatAccountName] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [connectMethod, setConnectMethod] = useState<'pat' | 'oauth'>('pat');
  const [patError, setPatError] = useState<string | null>(null);

  // Form states for OAuth connect
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthClientSecret, setOauthClientSecret] = useState('');

  const loadProviders = async () => {
    setIsLoading(true);
    try {
      const res = await authFetch('/api/integrations/providers');
      if (res.ok) {
        const data = await res.json();
        setProviders(data);
      }
    } catch (err: any) {
      showNotification('error', 'Erro ao carregar conexões', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const githubProvider = providers.find((p) => p.provider === 'github' && p.isActive);

  // Handle PAT Connection
  const handleConnectPat = async (e: React.FormEvent) => {
    e.preventDefault();
    setPatError(null);

    if (!patToken.trim()) {
      setPatError('Informe o Personal Access Token (PAT) do GitHub.');
      return;
    }

    setIsConnecting(true);
    try {
      const res = await authFetch('/api/integrations/github/connect-pat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: patToken.trim(),
          name: patAccountName.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPatError(data.error || 'Falha ao validar o token com o GitHub.');
      } else {
        showNotification(
          'success',
          'GitHub Conectado!',
          `Conta @${data.accountName} vinculada com sucesso.`
        );
        setPatToken('');
        setPatAccountName('');
        await loadProviders();
      }
    } catch (err: any) {
      setPatError(err.message || 'Erro de conexão.');
    } finally {
      setIsConnecting(false);
    }
  };

  // Handle Disconnect
  const handleDisconnect = async (providerId: string, accountName?: string) => {
    if (!confirm(`Deseja realmente desconectar a conta do GitHub @${accountName || 'vinculada'}?`)) {
      return;
    }

    try {
      const res = await authFetch(`/api/integrations/providers/${providerId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showNotification('info', 'Desconectado', 'A conta do GitHub foi desvinculada com sucesso.');
        loadProviders();
      } else {
        const data = await res.json();
        showNotification('error', 'Falha ao desconectar', data.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    }
  };

  // Test Connection / Refresh
  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const res = await authFetch('/api/integrations/github/repos');
      if (res.ok) {
        const data = await res.json();
        showNotification(
          'success',
          'Conexão Ativa',
          `Comunicação com o GitHub verificada. ${data.repositories?.length || 0} repositórios sincronizados.`
        );
      } else {
        const err = await res.json();
        showNotification('error', 'Falha na Validação', err.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-blue-600" />
            <span>Integrações & Provedores Git</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Conecte sua conta do GitHub para importar projetos com 1 clique, autodetectar Dockerfiles e habilitar Push-to-Deploy.
          </p>
        </div>

        <button
          onClick={loadProviders}
          disabled={isLoading}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200 rounded-lg self-start sm:self-auto transition-colors"
          title="Recarregar Provedores"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main GitHub Integration Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        {/* Card Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-2xs">
              <GitBranch className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">GitHub</h2>
                {githubProvider ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Conectado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                    Não Conectado
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Repositórios públicos e privados, branches, tags e webhooks automáticos.
              </p>
            </div>
          </div>

          {githubProvider && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>Testar Conexão</span>
              </button>
              <button
                type="button"
                onClick={() => handleDisconnect(githubProvider.id, githubProvider.accountName)}
                className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 border border-rose-200 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Desconectar</span>
              </button>
            </div>
          )}
        </div>

        {/* Card Body */}
        <div className="p-6">
          {githubProvider ? (
            /* Connected State */
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-4">
                  {githubProvider.avatarUrl ? (
                    <img
                      src={githubProvider.avatarUrl}
                      alt={githubProvider.accountName}
                      className="w-14 h-14 rounded-full border-2 border-white shadow-xs"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-lg">
                      {githubProvider.accountName?.[0]?.toUpperCase() || 'GH'}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{githubProvider.name}</span>
                      <a
                        href={githubProvider.accountUrl || `https://github.com/${githubProvider.accountName}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-mono text-blue-600 hover:underline flex items-center gap-1"
                      >
                        @{githubProvider.accountName}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Vinculado via <strong className="uppercase">{githubProvider.tokenType}</strong> • Conectado em{' '}
                      {new Date(githubProvider.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono text-slate-600 bg-white px-4 py-2.5 rounded-lg border border-slate-200 shadow-2xs">
                  {githubProvider.metadata?.publicRepos !== undefined && (
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans uppercase">Públicos</span>
                      <span className="font-bold text-slate-900">{githubProvider.metadata.publicRepos}</span>
                    </div>
                  )}
                  {githubProvider.metadata?.privateRepos !== undefined && (
                    <div className="border-l border-slate-100 pl-4">
                      <span className="text-[10px] text-slate-400 block font-sans uppercase">Privados</span>
                      <span className="font-bold text-slate-900">{githubProvider.metadata.privateRepos}</span>
                    </div>
                  )}
                  <div className="border-l border-slate-100 pl-4">
                    <span className="text-[10px] text-slate-400 block font-sans uppercase">Status</span>
                    <span className="text-emerald-600 font-bold font-sans">Ativo</span>
                  </div>
                </div>
              </div>

              {/* Scopes & Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 rounded-lg bg-blue-50/50 border border-blue-100">
                  <div className="font-bold text-blue-900 flex items-center gap-1.5 mb-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>Escopos Concedidos:</span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-mono">
                    {githubProvider.scopes || 'repo, read:user, admin:repo_hook'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Permite clonar repositórios privados, listar branches e configurar webhooks automaticamente.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5 mb-1">
                    <Lock className="w-3.5 h-3.5 text-slate-600" />
                    <span>Armazenamento Seguro:</span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-mono">
                    Token: {githubProvider.tokenMasked || '••••••••••••••••'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Credenciais são criptografadas e nunca exibidas em logs públicos.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Disconnected State / Connect Form */
            <div className="space-y-6">
              {/* Method Switcher */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                <button
                  type="button"
                  onClick={() => setConnectMethod('pat')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    connectMethod === 'pat'
                      ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                    <Key className="w-4 h-4 text-blue-600" />
                    <span>Token de Acesso (PAT)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Configuração imediata em 30 segundos sem precisar criar OAuth App.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setConnectMethod('oauth')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    connectMethod === 'oauth'
                      ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span>OAuth App (1-Clique)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Autorização direta pela tela de consentimento do GitHub.
                  </p>
                </button>
              </div>

              {/* PAT Form */}
              {connectMethod === 'pat' && (
                <form onSubmit={handleConnectPat} className="space-y-4 max-w-xl">
                  {patError && (
                    <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{patError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                      <span>Token GitHub PAT (Personal Access Token)</span>
                      <a
                        href="https://github.com/settings/tokens/new?scopes=repo,read:user,admin:repo_hook&description=DockerDomainManager"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-normal"
                      >
                        <span>Gerar Token no GitHub</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </label>

                    <div className="relative">
                      <input
                        type={showToken ? 'text' : 'password'}
                        required
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        value={patToken}
                        onChange={(e) => setPatToken(e.target.value)}
                        className="w-full px-3 py-2 pr-10 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      >
                        {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="mt-2 text-[11px] text-slate-500 space-y-1">
                      <p>
                        💡 <strong>Passo a passo rápido:</strong>
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5 text-slate-500">
                        <li>
                          Clique em <strong>&quot;Gerar Token no GitHub&quot;</strong> acima.
                        </li>
                        <li>
                          Certifique-se de marcar os escopos: <code className="font-mono text-blue-700 font-bold">repo</code> (acesso aos repositórios) e <code className="font-mono text-blue-700 font-bold">read:user</code> (perfil e avatar).
                        </li>
                        <li>Copie o token gerado e cole no campo acima.</li>
                      </ul>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Rótulo / Nome de Exibição (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Meu GitHub Pessoal ou Organização"
                      value={patAccountName}
                      onChange={(e) => setPatAccountName(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isConnecting || !patToken.trim()}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center gap-2"
                  >
                    {isConnecting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Validando Token com GitHub...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Conectar Conta GitHub</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* OAuth Form */}
              {connectMethod === 'oauth' && (
                <div className="space-y-4 max-w-xl">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
                    <p className="font-bold text-slate-800">
                      Integração via GitHub OAuth App:
                    </p>
                    <p>
                      Para utilizar login e consentimento em 1 clique do GitHub, registre uma aplicação em{' '}
                      <a
                        href="https://github.com/settings/developers"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline font-semibold"
                      >
                        github.com/settings/developers
                      </a>:
                    </p>
                    <div className="p-2.5 bg-white border border-slate-200 rounded font-mono text-[11px] space-y-1">
                      <div>
                        <strong>Homepage URL:</strong> {window.location.origin}
                      </div>
                      <div>
                        <strong>Authorization callback URL:</strong> {window.location.origin}/api/integrations/github/callback
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Client ID do GitHub
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Iv1.xxxxxxxxxxxxxxxx"
                        value={oauthClientId}
                        onChange={(e) => setOauthClientId(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Client Secret
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••••••••••••••••••••••••••"
                        value={oauthClientSecret}
                        onChange={(e) => setOauthClientSecret(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!oauthClientId.trim()) {
                        alert('Informe o Client ID do GitHub OAuth App.');
                        return;
                      }
                      const redirect = `${window.location.origin}/api/integrations/github/callback`;
                      const url = `https://github.com/login/oauth/authorize?client_id=${oauthClientId.trim()}&redirect_uri=${encodeURIComponent(
                        redirect
                      )}&scope=repo,read:user,admin:repo_hook`;
                      window.location.href = url;
                    }}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center gap-2"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>Ir para Tela de Permissão do GitHub</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Providers Section */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Outros Provedores Suportados (Em Expansão)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* GitLab */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs opacity-80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-xs border border-orange-100">
                🦊
              </div>
              <div>
                <span className="font-bold text-xs text-slate-900 block">GitLab</span>
                <span className="text-[10px] text-slate-400">GitLab.com & Self-Hosted</span>
              </div>
            </div>
            <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
              Em Breve
            </span>
          </div>

          {/* Bitbucket */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs opacity-80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs border border-blue-100">
                🔷
              </div>
              <div>
                <span className="font-bold text-xs text-slate-900 block">Bitbucket</span>
                <span className="text-[10px] text-slate-400">Atlassian Cloud</span>
              </div>
            </div>
            <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
              Em Breve
            </span>
          </div>

          {/* Gitea / Forgejo */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs opacity-80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs border border-emerald-100">
                🍵
              </div>
              <div>
                <span className="font-bold text-xs text-slate-900 block">Gitea / Forgejo</span>
                <span className="text-[10px] text-slate-400">Servidores Independentes</span>
              </div>
            </div>
            <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
              Em Breve
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
