import React, { useState, useEffect } from 'react';
import { Settings, Shield, Server, FileText, Check, Save, RefreshCw, Download, Sparkles, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext.tsx';
import type { AppSettings } from '../../types/index.ts';

interface SettingsViewProps {
  onSettingsSaved?: () => void;
  projectId?: string | null;
  projectName?: string;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onSettingsSaved,
  projectId,
  projectName,
}) => {
  const { showNotification } = useNotification();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [mainDomain, setMainDomain] = useState('meudominio.com.br');
  const [dockerSocketPath, setDockerSocketPath] = useState('/var/run/docker.sock');
  const [traefikPath, setTraefikPath] = useState('./traefik/dynamic/dynamic_conf.yml');
  const [autoApply, setAutoApply] = useState(true);
  const [defaultFallback, setDefaultFallback] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // System Version & Updates State
  const [systemVersion, setSystemVersion] = useState<{
    currentVersion: string;
    latestVersion: string;
    updateAvailable: boolean;
    releaseName: string | null;
    releaseNotes: string | null;
    releaseUrl: string | null;
  } | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchVersion = async () => {
    setIsCheckingUpdate(true);
    try {
      const res = await fetch('/api/system/version', {
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSystemVersion(data);
      }
    } catch (err) {
      console.warn('Falha ao verificar versão do sistema:', err);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    fetchVersion();
  }, []);

  const handleTriggerUpdate = async () => {
    if (!confirm('Deseja iniciar a atualização do Docker Domain Manager? Os containers serão atualizados para a versão mais recente.')) {
      return;
    }
    setIsUpdating(true);
    try {
      const res = await fetch('/api/system/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('success', 'Atualização Iniciada', data.message);
      } else {
        showNotification('error', 'Falha ao atualizar', data.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const url = projectId
          ? `/api/settings?projectId=${encodeURIComponent(projectId)}`
          : '/api/settings';
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
        });
        if (res.ok) {
          const json = await res.json();
          setSettings(json);
          if (json.mainDomain) setMainDomain(json.mainDomain);
          if (json.dockerSocketPath) setDockerSocketPath(json.dockerSocketPath);
          if (json.traefikDynamicConfigPath) setTraefikPath(json.traefikDynamicConfigPath);
          if (json.autoApplyTraefik !== undefined) setAutoApply(json.autoApplyTraefik);
          if (json.defaultFallbackEnabled !== undefined) setDefaultFallback(json.defaultFallbackEnabled);
        }
      } catch (err) {
        console.error('Falha ao carregar configurações:', err);
      }
    };
    fetchSettings();
  }, [projectId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
        },
        body: JSON.stringify({
          projectId: projectId || undefined,
          mainDomain,
          dockerSocketPath,
          traefikDynamicConfigPath: traefikPath,
          autoApplyTraefik: autoApply,
          defaultFallbackEnabled: defaultFallback,
        }),
      });

      if (res.ok) {
        showNotification(
          'success',
          'Configurações Salvas',
          projectName
            ? `Parâmetros do projeto "${projectName}" atualizados com sucesso.`
            : 'Parâmetros do sistema atualizados com sucesso.'
        );
        onSettingsSaved?.();
      } else {
        showNotification('error', 'Erro', 'Falha ao salvar configurações.');
      }
    } catch (err: any) {
      showNotification('error', 'Erro de Conexão', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Settings Form */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              {projectName ? `Configurações do Projeto: ${projectName}` : 'Configurações Gerais da Aplicação'}
            </h3>
          </div>
          {projectName && (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Projeto Ativo
            </span>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Domínio Principal {projectName ? `do Projeto (${projectName})` : 'Padrão'}
            </label>
            <input
              type="text"
              required
              value={mainDomain}
              onChange={(e) => setMainDomain(e.target.value)}
              placeholder="ex: meudominio.com.br"
              className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            />
            <span className="text-[10px] text-slate-400">
              Domínio base utilizado para sugestão de subdomínios e roteamento padrão.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Caminho do Socket Docker Engine
            </label>
            <input
              type="text"
              required
              value={dockerSocketPath}
              onChange={(e) => setDockerSocketPath(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            />
            <span className="text-[10px] text-slate-400">
              Padrão em Linux / Docker: <code className="font-mono">/var/run/docker.sock</code>
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Caminho do Arquivo de Configuração Dinâmica do Traefik
            </label>
            <input
              type="text"
              required
              value={traefikPath}
              onChange={(e) => setTraefikPath(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            />
            <span className="text-[10px] text-slate-400">
              Onde o Traefik monitora as regras geradas (Provider File com watch: true)
            </span>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoApply}
                onChange={(e) => setAutoApply(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <div>
                <span className="text-xs font-semibold text-slate-900 block">
                  Aplicar Alterações no Traefik Automaticamente
                </span>
                <span className="text-[11px] text-slate-500">
                  Gera e grava o arquivo dynamic_conf.yml imediatamente após qualquer cadastro ou edição de domínio/serviço.
                </span>
              </div>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={defaultFallback}
                onChange={(e) => setDefaultFallback(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <div>
                <span className="text-xs font-semibold text-slate-900 block">
                  Habilitar Regra de Serviço Padrão (Catch-All)
                </span>
                <span className="text-[11px] text-slate-500">
                  Inclui o router HostRegexp(`{'{host:.+}'}`) com prioridade 1 na configuração gerada.
                </span>
              </div>
            </label>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Version & Platform Updates Card */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Versão & Atualizações do Sistema</h3>
              <p className="text-xs text-slate-500">Mantenha a plataforma atualizada com as últimas correções e recursos.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchVersion}
              disabled={isCheckingUpdate}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
              <span>{isCheckingUpdate ? 'Checando...' : 'Verificar Atualizações'}</span>
            </button>

            {systemVersion?.updateAvailable && (
              <button
                type="button"
                onClick={handleTriggerUpdate}
                disabled={isUpdating}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
              >
                <Download className={`w-3.5 h-3.5 ${isUpdating ? 'animate-bounce' : ''}`} />
                <span>{isUpdating ? 'Atualizando...' : 'Atualizar Sistema'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
              {systemVersion?.currentVersion || 'v0.1.0'}
            </span>
            <div>
              {systemVersion?.updateAvailable ? (
                <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                  <span>Nova versão disponível:</span>
                  <span className="font-mono font-bold">{systemVersion.latestVersion}</span>
                </div>
              ) : (
                <div className="text-xs text-slate-600 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Você está utilizando a versão mais recente da plataforma.</span>
                </div>
              )}
            </div>
          </div>

          {systemVersion?.releaseUrl && (
            <a
              href={systemVersion.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 hover:underline"
            >
              <span>Notas da Versão no GitHub</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Security Architecture Box */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-6">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-900">Diretrizes de Segurança Implementadas</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600 leading-relaxed">
          <div className="p-3.5 rounded bg-slate-50 border border-slate-200">
            <strong className="text-slate-900 block mb-1">Docker Socket Isolado</strong>
            O socket <code className="font-mono">/var/run/docker.sock</code> é acessível exclusivamente
            pelo backend da aplicação. No Docker Compose, o bind é montado com o modificador de somente-leitura{' '}
            <code className="font-mono">:ro</code>, impedindo mutações não autorizadas.
          </div>

          <div className="p-3.5 rounded bg-slate-50 border border-slate-200">
            <strong className="text-slate-900 block mb-1">Proteção contra Injeção de Comandos</strong>
            Nenhum dado informado pelo usuário é interpolado em shells (`exec`, `system`).
            Todas as chamadas à Docker Engine são efetuadas via requisições REST tipadas contra o endpoint do Docker API.
          </div>

          <div className="p-3.5 rounded bg-slate-50 border border-slate-200">
            <strong className="text-slate-900 block mb-1">Senhas com Hash Criptográfico</strong>
            Armazenamento seguro utilizando derivação PBKDF2 (SHA-512) com 10.000 iterações e salt,
            garantindo proteção contra ataques de dicionário e rainbow tables.
          </div>

          <div className="p-3.5 rounded bg-slate-50 border border-slate-200">
            <strong className="text-slate-900 block mb-1">Trilha Completa de Auditoria</strong>
            Todas as ações administrativas (criação de domínios, parada de containers, sincronização de proxy)
            são registradas com carimbo de data/hora, IP de origem e identificação de usuário.
          </div>
        </div>
      </div>
    </div>
  );
};
