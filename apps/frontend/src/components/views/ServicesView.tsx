import React, { useState } from 'react';
import {
  Play,
  Square,
  RotateCw,
  FileText,
  Edit2,
  Trash2,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Compass,
  GitBranch,
  Hammer,
  Sparkles,
  Terminal,
  Boxes,
  RefreshCw,
  Server,
  Settings2,
  Layers,
  Box,
} from 'lucide-react';
import type { Service } from '../../types/index.ts';

interface ServicesViewProps {
  services: Service[];
  onOpenCreate: () => void;
  onOpenImportCompose?: () => void;
  onOpenTemplateModal: () => void;
  onGoToContainers?: () => void;
  onOpenEdit: (service: Service) => void;
  onOpenTerminal?: (service: Service) => void;
  onDelete: (service: Service) => void;
  onToggleActive: (service: Service) => void;
  onStartContainer: (service: Service) => void;
  onStopContainer: (service: Service) => void;
  onRestartContainer: (service: Service) => void;
  onViewLogs: (service: Service) => void;
  onViewBuildLogs: (service: Service) => void;
  onTriggerRebuild: (service: Service) => void;
  isLoading: boolean;
  onRefresh?: () => void;
}

export const ServicesView: React.FC<ServicesViewProps> = ({
  services,
  onOpenCreate,
  onOpenImportCompose,
  onOpenTemplateModal,
  onGoToContainers,
  onOpenEdit,
  onOpenTerminal,
  onDelete,
  onToggleActive,
  onStartContainer,
  onStopContainer,
  onRestartContainer,
  onViewLogs,
  onViewBuildLogs,
  onTriggerRebuild,
  isLoading,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped'>('all');

  const filtered = services.filter((svc) => {
    const matchesSearch =
      svc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      svc.containerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      svc.image.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'running'
        ? svc.status === 'running'
        : svc.status !== 'running';

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-5">
      {/* Action and Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar serviço por nome, container ou imagem..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* Interactive filter tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({services.length})
            </button>
            <button
              onClick={() => setStatusFilter('running')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                statusFilter === 'running' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ativos
            </button>
            <button
              onClick={() => setStatusFilter('stopped')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                statusFilter === 'stopped' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Parados
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0 disabled:opacity-50"
              title="Atualizar lista de serviços"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          )}

          {onOpenImportCompose && (
            <button
              onClick={onOpenImportCompose}
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0"
              title="Detectar e importar projetos e stacks Docker Compose inteiros"
            >
              <Boxes className="w-4 h-4 text-indigo-600" />
              <span>Importar Compose</span>
            </button>
          )}

          {onGoToContainers && (
            <button
              onClick={onGoToContainers}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0"
              title="Visualizar e importar containers existentes no Docker"
            >
              <Boxes className="w-4 h-4 text-slate-500" />
              <span>Importar Container</span>
            </button>
          )}

          <button
            onClick={onOpenTemplateModal}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0"
            title="Criar banco de dados, Redis, RabbitMQ, etc. a partir de templates rápidos"
          >
            <Sparkles className="w-4 h-4 text-emerald-100" />
            <span>Templates Prontos</span>
          </button>

          <button
            onClick={onOpenCreate}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Serviço</span>
          </button>
        </div>
      </div>

      {/* Services Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden relative">
        {isLoading && (
          <div className="h-0.5 w-full bg-blue-100 overflow-hidden absolute top-0 left-0 right-0 z-10">
            <div className="h-full bg-blue-600 animate-pulse w-full"></div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-semibold">
              <tr>
                <th className="px-5 py-3">Serviço</th>
                <th className="px-4 py-3">Container Docker</th>
                <th className="px-4 py-3">Porta Interna</th>
                <th className="px-4 py-3">Status Container</th>
                <th className="px-4 py-3">Domínios</th>
                <th className="px-4 py-3">Roteamento</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && services.length === 0 ? (
                <>
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center bg-slate-50/50">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
                        <p className="text-xs font-semibold text-slate-700">Carregando serviços e containers...</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Consultando stacks e status no Docker...</p>
                      </div>
                    </td>
                  </tr>
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <tr key={`skeleton-${idx}`} className="animate-pulse">
                      <td className="px-5 py-3.5">
                        <div className="h-3.5 bg-slate-200 rounded w-32 mb-1.5" />
                        <div className="h-2.5 bg-slate-100 rounded w-20" />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="h-3.5 bg-slate-200 rounded w-24 mb-1" />
                        <div className="h-2.5 bg-slate-100 rounded w-16" />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="h-3.5 bg-slate-200 rounded w-10" />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="h-4 bg-slate-200 rounded-full w-16" />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="h-3.5 bg-slate-200 rounded w-24" />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="h-4 bg-slate-200 rounded-full w-12" />
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <div className="w-5 h-5 bg-slate-200 rounded" />
                          <div className="w-5 h-5 bg-slate-200 rounded" />
                          <div className="w-5 h-5 bg-slate-200 rounded" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
              ) : filtered.length > 0 ? (
                filtered.map((svc) => {
                  const isRunning = svc.status === 'running';
                  return (
                    <tr key={svc.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name & Notes */}
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => onOpenEdit(svc)}
                            className="font-semibold text-slate-900 hover:text-blue-600 transition-colors text-left"
                            title="Abrir página de configuração completa do serviço"
                          >
                            {svc.name}
                          </button>
                          {svc.dockerHost?.name && (
                            <span
                              className="text-[10px] text-slate-600 font-medium px-1.5 py-0.2 bg-slate-100 border border-slate-200 rounded flex items-center gap-1"
                              title={`Servidor: ${svc.dockerHost.name} (${svc.dockerHost.type})`}
                            >
                              <Server className="w-2.5 h-2.5 text-slate-400" />
                              <span>{svc.dockerHost.name}</span>
                            </span>
                          )}
                          {svc.isSwarm ? (
                            <span
                              className="text-[10px] text-purple-700 font-semibold px-1.5 py-0.2 bg-purple-50 border border-purple-200 rounded flex items-center gap-1 shadow-2xs"
                              title="Stack gerenciada em Modo Docker Swarm (VIP Overlay Load Balancer)"
                            >
                              <Layers className="w-2.5 h-2.5 text-purple-600" />
                              <span>Swarm</span>
                            </span>
                          ) : (
                            <span
                              className="text-[10px] text-slate-600 font-medium px-1.5 py-0.2 bg-slate-50 border border-slate-200 rounded flex items-center gap-1"
                              title="Container Standalone / Docker Compose"
                            >
                              <Box className="w-2.5 h-2.5 text-slate-400" />
                              <span>Standalone</span>
                            </span>
                          )}
                          {svc.containerCount && svc.containerCount > 1 && (
                            <button
                              onClick={() => onOpenEdit(svc)}
                              className="text-[10px] text-blue-700 font-semibold px-1.5 py-0.2 bg-blue-50 border border-blue-200 rounded flex items-center gap-1 hover:bg-blue-100 transition-colors"
                              title="Visualizar containers desta stack"
                            >
                              <Boxes className="w-2.5 h-2.5" />
                              <span>{svc.containerCount} containers</span>
                            </button>
                          )}
                          {svc.isDefault && (
                            <span className="text-[10px] text-indigo-700 font-semibold px-1.5 py-0.2 bg-indigo-50 border border-indigo-200 rounded">
                              Padrão
                            </span>
                          )}
                          {svc.sourceType === 'GITHUB' && (
                            <button
                              onClick={() => onViewBuildLogs(svc)}
                              className="text-[10px] text-blue-700 font-semibold px-1.5 py-0.2 bg-blue-50 border border-blue-200 rounded flex items-center gap-1 hover:bg-blue-100 transition-colors"
                              title="Ver pipeline de build e webhook"
                            >
                              <GitBranch className="w-2.5 h-2.5" />
                              <span>GitHub: {svc.gitBranch || 'main'}</span>
                            </button>
                          )}
                        </div>
                        {svc.notes && (
                          (() => {
                            const cleanNotes = svc.notes.replace(/<!--dm-meta:[\s\S]*?-->/g, '').trim();
                            return cleanNotes ? (
                              <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs">{cleanNotes}</p>
                            ) : null;
                          })()
                        )}
                        {svc.sourceType === 'GITHUB' && svc.lastBuiltAt && (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Build: {new Date(svc.lastBuiltAt).toLocaleTimeString('pt-BR')}
                          </p>
                        )}
                      </td>

                      {/* Container & Image */}
                      <td className="px-4 py-3">
                        <div className="font-mono text-slate-800 font-medium">{svc.containerName}</div>
                        <div className="font-mono text-[11px] text-slate-400 truncate max-w-[150px]">
                          {svc.sourceType === 'GITHUB' ? (
                            <span className="text-blue-600 font-medium">Build: {svc.containerName}:latest</span>
                          ) : (
                            svc.image
                          )}
                        </div>
                      </td>

                      {/* Internal Port */}
                      <td className="px-4 py-3 font-mono tabular-nums text-slate-800 font-medium">
                        :{svc.internalPort}
                      </td>

                      {/* Container Status */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {isRunning ? (
                            <span className="text-emerald-700 font-semibold flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Em execução</span>
                            </span>
                          ) : (
                            <span className="text-slate-500 flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5 text-rose-500" />
                              <span>Parado</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Associated Domains */}
                      <td className="px-4 py-3">
                        <div className="text-slate-700">
                          {svc.domains && svc.domains.length > 0 ? (
                            <span className="font-semibold">{svc.domains.length} domínio(s)</span>
                          ) : (
                            <span className="text-slate-400">Nenhum</span>
                          )}
                        </div>
                      </td>

                      {/* Routing Active Toggle */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onToggleActive(svc)}
                          className={`text-xs font-semibold px-2 py-0.5 rounded border transition-colors ${
                            svc.isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {svc.isActive ? 'Ativo' : 'Inativo'}
                        </button>
                      </td>

                      {/* Action buttons */}
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* GitHub Build & Logs Button */}
                          {svc.sourceType === 'GITHUB' && (
                            <button
                              onClick={() => onViewBuildLogs(svc)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                              title="Pipeline de Build & Webhook GitHub"
                            >
                              <Hammer className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Container Controls */}
                          {isRunning ? (
                            <button
                              onClick={() => onStopContainer(svc)}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"
                              title="Parar Container"
                            >
                              <Square className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => onStartContainer(svc)}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
                              title="Iniciar Container"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => onRestartContainer(svc)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
                            title="Reiniciar Container"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onOpenEdit(svc)}
                            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                            title="Gerenciar Serviço"
                          >
                            <Settings2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => onDelete(svc)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded"
                            title="Excluir Serviço"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                    <Boxes className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600 text-xs mb-0.5">Nenhum serviço encontrado</p>
                    <p className="text-[11px] text-slate-400">
                      {searchTerm || statusFilter !== 'all'
                        ? 'Tente ajustar os filtros de busca ou status.'
                        : 'Nenhum serviço Docker cadastrado no momento.'}
                    </p>
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
