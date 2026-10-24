import React, { useState, useEffect } from 'react';
import {
  Route,
  CheckCircle,
  AlertTriangle,
  Copy,
  Check,
  Download,
  History,
  FileCode,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import type { ProxyConfiguration } from '../../types/index.ts';

interface TraefikViewProps {
  onApplyConfig: () => Promise<void>;
  isApplying: boolean;
  projectId?: string | null;
  projectName?: string;
}

export const TraefikView: React.FC<TraefikViewProps> = ({
  onApplyConfig,
  isApplying,
  projectId,
  projectName,
}) => {
  const [configData, setConfigData] = useState<any>(null);
  const [revisions, setRevisions] = useState<ProxyConfiguration[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<ProxyConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadTraefikData = async () => {
    setIsLoading(true);
    try {
      const previewUrl = projectId
        ? `/api/traefik/preview?projectId=${encodeURIComponent(projectId)}`
        : '/api/traefik/preview';

      const [previewRes, revsRes] = await Promise.all([
        fetch(previewUrl, {
          headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
        }),
        fetch('/api/traefik/revisions', {
          headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
        }),
      ]);

      if (previewRes.ok) {
        const pData = await previewRes.json();
        setConfigData(pData);
      }
      if (revsRes.ok) {
        const rData = await revsRes.json();
        setRevisions(rData);
      }
    } catch (err) {
      console.error('Falha ao carregar dados do Traefik:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTraefikData();
  }, [projectId]);

  const handleCopy = () => {
    if (!configData?.yaml) return;
    navigator.clipboard.writeText(configData.yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!configData?.yaml) return;
    const blob = new Blob([configData.yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dynamic_conf.yml';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Overview & Action Strip */}
      <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Route className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Provedor Dinâmico de Configuração do Traefik
            </h3>
            {projectName && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                Projeto: {projectName}
              </span>
            )}
            {configData?.valid ? (
              <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                Sintaxe Válida
              </span>
            ) : (
              <span className="text-xs font-semibold text-rose-700 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Erro na Validação
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Arquivo de destino:{' '}
            <code className="font-mono text-slate-800 font-semibold">{configData?.filePath || '/etc/traefik/dynamic/dynamic_conf.yml'}</code>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={loadTraefikData}
            disabled={isLoading}
            className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-md text-xs"
            title="Recarregar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleCopy}
            className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-semibold flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado' : 'Copiar YAML'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Baixar .yml</span>
          </button>

          <button
            onClick={onApplyConfig}
            disabled={isApplying || !configData?.valid}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
          >
            <Route className={`w-3.5 h-3.5 ${isApplying ? 'animate-spin' : ''}`} />
            <span>{isApplying ? 'Aplicando...' : 'Aplicar Configuração'}</span>
          </button>
        </div>
      </div>

      {/* Traefik Validation Diagnostics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500">Routers Compilados</span>
          <div className="text-xl font-bold font-mono text-slate-900 mt-1">
            {configData?.routersCount ?? 0}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Regras Host(...) mapeadas</span>
        </div>

        <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500">Serviços Traefik</span>
          <div className="text-xl font-bold font-mono text-slate-900 mt-1">
            {configData?.servicesCount ?? 0}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">LoadBalancers internos</span>
        </div>

        <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500">Serviço Padrão (Catch-All)</span>
          <div className="text-xl font-bold font-mono text-slate-900 mt-1">
            {configData?.hasDefaultFallback ? (
              <span className="text-emerald-700">Ativo</span>
            ) : (
              <span className="text-amber-700">Inativo</span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {configData?.hasDefaultFallback ? 'HostRegexp(`{host:.+}`) P1' : 'Sem rota catch-all'}
          </span>
        </div>
      </div>

      {/* Live YAML Code Viewer */}
      <div className="bg-slate-900 rounded-lg border border-slate-800 shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-blue-400" />
            <span className="font-mono font-bold">dynamic_conf.yml (Traefik Dynamic Provider)</span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">Formato YAML 1.2</span>
        </div>

        <div className="p-4 max-h-[480px] overflow-y-auto font-mono text-xs text-slate-200 leading-relaxed bg-black/40">
          <pre className="whitespace-pre-wrap">{configData?.yaml || '# Gerando configuração...'}</pre>
        </div>
      </div>

      {/* Revision History */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            Histórico de Revisões Aplicadas
          </h3>
          <span className="text-xs text-slate-500 font-mono">{revisions.length} versão(ões)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-semibold">
              <tr>
                <th className="px-5 py-2.5">Versão</th>
                <th className="px-4 py-2.5">Data/Hora</th>
                <th className="px-4 py-2.5">Aplicado Por</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-5 py-2.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {revisions.map((rev) => (
                <tr key={rev.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-2.5 font-mono font-bold text-slate-800">v{rev.version}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                    {new Date(rev.appliedAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-2.5 text-slate-800 font-medium">
                    {rev.appliedByName || rev.appliedBy}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        rev.status === 'applied'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {rev.status === 'applied' ? 'Aplicado' : 'Falhou'}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <button
                      onClick={() => setSelectedRevision(rev)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                    >
                      Ver Conteúdo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Revision Modal */}
      {selectedRevision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-slate-900 rounded-xl shadow-2xl border border-slate-800 w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden text-slate-100">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold font-mono">
                Revisão v{selectedRevision.version} ({new Date(selectedRevision.appliedAt).toLocaleString('pt-BR')})
              </h3>
              <button
                onClick={() => setSelectedRevision(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed bg-black/60">
              <pre className="whitespace-pre-wrap">{selectedRevision.contentYaml}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
