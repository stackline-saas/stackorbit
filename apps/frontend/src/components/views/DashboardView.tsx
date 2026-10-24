import React from 'react';
import {
  Server,
  Globe,
  Boxes,
  Compass,
  AlertTriangle,
  ArrowRight,
  Shield,
  Clock,
  Terminal,
  Activity,
} from 'lucide-react';
import type { DashboardStats, Service, Domain } from '../../types/index.ts';
import type { ActiveTab } from '../Sidebar.tsx';

interface DashboardViewProps {
  stats: DashboardStats | null;
  services: Service[];
  domains: Domain[];
  onNavigate: (tab: ActiveTab) => void;
  onOpenNewService: () => void;
  onOpenTemplateModal?: () => void;
  onOpenNewDomain: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  services,
  domains,
  onNavigate,
  onOpenNewService,
  onOpenTemplateModal,
  onOpenNewDomain,
}) => {
  const defaultService = services.find((s) => s.isDefault);

  return (
    <div className="space-y-6">
      {/* Fallback Warning if no default service configured */}
      {!defaultService && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold">Nenhum Serviço Padrão Configurado</h4>
              <p className="text-xs text-amber-800 mt-0.5">
                Requisições para domínios não cadastrados resultarão em erro 404 pelo Traefik.
                Configure um container padrão para capturar tráfego catch-all com a regra{' '}
                <code className="font-mono font-semibold">HostRegexp(`{'{host:.+}'}`)</code>.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('default-service')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-semibold whitespace-nowrap transition-colors"
          >
            Configurar Agora
          </button>
        </div>
      )}

      {/* KPI Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Serviços */}
        <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Serviços Cadastrados</span>
            <Server className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {stats?.totalServices ?? services.length}
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <span className="text-emerald-600 font-semibold">{stats?.activeServices ?? services.filter((s) => s.isActive).length} ativos</span>
            <span aria-hidden="true">·</span>
            <span>{services.length - (stats?.activeServices ?? services.filter((s) => s.isActive).length)} inativos</span>
          </div>
        </div>

        {/* Card 2: Domínios */}
        <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Domínios Ativos</span>
            <Globe className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {stats?.totalDomains ?? domains.length}
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <span>Roteados via Traefik</span>
            <span aria-hidden="true">·</span>
            <span className="text-blue-600 font-medium">Cloudflare Proxy</span>
          </div>
        </div>

        {/* Card 3: Containers */}
        <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Containers Docker</span>
            <Boxes className="w-4 h-4 text-slate-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {stats?.runningContainers ?? 0}
            <span className="text-xs font-normal text-slate-500 ml-1">em execução</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <span className="text-emerald-600 font-semibold">{stats?.runningContainers ?? 0} online</span>
            <span aria-hidden="true">·</span>
            <span>{stats?.stoppedContainers ?? 0} parados</span>
          </div>
        </div>

        {/* Card 4: Serviço Padrão */}
        <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Serviço Padrão (Catch-All)</span>
            <Compass className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-base font-bold text-slate-900 truncate">
            {defaultService ? defaultService.name : 'Não configurado'}
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            {defaultService ? (
              <>
                <span className="font-mono text-slate-700">{defaultService.containerName}:{defaultService.internalPort}</span>
                <span aria-hidden="true">·</span>
                <span className="text-indigo-600 font-medium">Prioridade 1</span>
              </>
            ) : (
              <span className="text-amber-600">Sem fallback</span>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Docker Connection & Traefik Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Docker Engine Card */}
        <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" />
                Status do Docker Engine
              </h3>
              <span className="text-xs font-semibold text-emerald-600">
                {stats?.dockerConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Versão da Engine:</span>
                <span className="font-mono font-medium text-slate-800">{stats?.dockerEngineVersion || '26.1.0'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Caminho do Socket:</span>
                <span className="font-mono text-[11px] text-slate-800 truncate max-w-[180px]">
                  {stats?.dockerSocketPath || '/var/run/docker.sock'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Modo de Operação:</span>
                <span className="text-slate-800 font-medium">
                  {stats?.dockerIsEmulated ? 'Sandbox Emulada (Demonstração)' : 'Socket Unix Nativo (:ro)'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate('containers')}
            className="mt-4 pt-3 border-t border-slate-100 text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center justify-between"
          >
            <span>Inspecionar Containers</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Cloudflare & SSL Card */}
        <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600" />
                Criptografia Cloudflare
              </h3>
              <span className="text-xs font-semibold text-blue-600">Full (strict)</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              O tráfego público HTTPS é encerrado e inspecionado pelos servidores de borda do Cloudflare.
              O Traefik responde na porta 443 com o Certificado de Origem (Origin CA), dispensando Let’s Encrypt.
            </p>
            <div className="mt-3 p-2.5 rounded bg-slate-50 border border-slate-200 text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Certificado Origem:</span>
                <span className="font-mono text-slate-800">/etc/traefik/certs/origin.pem</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Chave Privada:</span>
                <span className="font-mono text-slate-800">/etc/traefik/certs/origin.key</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate('cloudflare')}
            className="mt-4 pt-3 border-t border-slate-100 text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center justify-between"
          >
            <span>Ver Instruções do Cloudflare</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Traefik Dynamic Router Card */}
        <div className="p-5 rounded-lg bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-600" />
                Traefik Proxy Reverso
              </h3>
              <span className="text-xs font-semibold text-emerald-600">Sincronizado</span>
            </div>
            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Routers Ativos:</span>
                <span className="font-mono font-medium text-slate-800">
                  {domains.filter((d) => d.isActive).length + (defaultService ? 1 : 0)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Serviços Traefik:</span>
                <span className="font-mono font-medium text-slate-800">{services.filter((s) => s.isActive).length}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Última Aplicação:</span>
                <span className="text-slate-700">
                  {stats?.lastProxyConfigAppliedAt
                    ? new Date(stats.lastProxyConfigAppliedAt).toLocaleTimeString('pt-BR')
                    : 'Recente'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate('traefik')}
            className="mt-4 pt-3 border-t border-slate-100 text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center justify-between"
          >
            <span>Ver Configuração YAML</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Actions Bar */}
      <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-bold text-slate-800">Ações Rápidas:</span>
        <div className="flex items-center gap-2.5">
          {onOpenTemplateModal && (
            <button
              onClick={onOpenTemplateModal}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <span>+ Template Pronto</span>
            </button>
          )}
          <button
            onClick={onOpenNewService}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold transition-colors"
          >
            + Novo Serviço
          </button>
          <button
            onClick={onOpenNewDomain}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold transition-colors"
          >
            + Associar Domínio
          </button>
          <button
            onClick={() => onNavigate('tests')}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md text-xs font-semibold transition-colors"
          >
            Executar Diagnóstico
          </button>
        </div>
      </div>

      {/* Recent Changes / Audit Trail */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            Últimas Alterações e Auditoria
          </h3>
          <button
            onClick={() => onNavigate('audit')}
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
          >
            Ver histórico completo →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-semibold">
              <tr>
                <th className="px-5 py-2.5">Data/Hora</th>
                <th className="px-4 py-2.5">Usuário</th>
                <th className="px-4 py-2.5">Ação</th>
                <th className="px-4 py-2.5">Entidade</th>
                <th className="px-5 py-2.5">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats?.recentAuditLogs && stats.recentAuditLogs.length > 0 ? (
                stats.recentAuditLogs.slice(0, 6).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                      {log.userName}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                      {log.entityType}
                    </td>
                    <td className="px-5 py-2.5 text-slate-600 truncate max-w-md">
                      {log.details}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-slate-400">
                    Nenhum registro de auditoria encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
