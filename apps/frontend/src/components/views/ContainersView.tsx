import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Play,
  Square,
  RotateCw,
  FileText,
  Search,
  CheckCircle,
  XCircle,
  Activity,
  RefreshCw,
  Terminal,
  PlusCircle,
} from 'lucide-react';
import type { DockerContainerInfo } from '../../types/index.ts';

interface ContainersViewProps {
  onViewLogs: (containerName: string) => void;
  onRestart: (containerName: string) => void;
  onRefresh: () => void;
  onOpenTerminal?: (containerName: string) => void;
  onImportContainer?: (container: DockerContainerInfo) => void;
  onOpenImportCompose?: () => void;
  existingServices?: Array<{ containerName: string; id: string; name: string }>;
  projectId?: string | null;
  projectName?: string;
}

export const ContainersView: React.FC<ContainersViewProps> = ({
  onViewLogs,
  onRestart,
  onRefresh,
  onOpenTerminal,
  onImportContainer,
  onOpenImportCompose,
  existingServices = [],
  projectId,
  projectName,
}) => {
  const [containers, setContainers] = useState<DockerContainerInfo[]>([]);
  const [statusInfo, setStatusInfo] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadContainers = async () => {
    setIsLoading(true);
    try {
      const url = projectId
        ? `/api/containers?projectId=${encodeURIComponent(projectId)}`
        : '/api/containers';
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setContainers(data);
          setStatusInfo({ connected: true, socketPath: '/var/run/docker.sock' });
        } else {
          setContainers(data.containers || []);
          setStatusInfo(data.status);
        }
      }
    } catch (err) {
      console.error('Falha ao carregar containers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadContainers();
  }, [projectId]);

  const filtered = containers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.image.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Docker Engine info card */}
      <div className="p-4 rounded-lg bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Docker Engine API {statusInfo?.version ? `v${statusInfo.version}` : 'v1.45'}
              </h3>
              <span className={`text-xs font-semibold ${statusInfo?.connected ? 'text-emerald-600' : 'text-red-500'}`}>
                {statusInfo?.connected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Socket: <code className="font-mono">{statusInfo?.socketPath || '/var/run/docker.sock'}</code> ·{' '}
              {statusInfo?.isEmulated ? 'Modo Demonstração (Sandbox)' : 'Socket Unix de Produção'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onOpenImportCompose && (
            <button
              onClick={onOpenImportCompose}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Importar projeto Docker Compose inteiro"
            >
              <Boxes className="w-3.5 h-3.5 text-indigo-600" />
              <span>Importar Compose</span>
            </button>
          )}

          <button
            onClick={loadContainers}
            disabled={isLoading}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar Containers</span>
          </button>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-md w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por nome ou imagem Docker..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <span className="text-xs text-slate-500 font-mono">
          {filtered.length} container(s) listados
        </span>
      </div>

      {/* Containers Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-semibold">
              <tr>
                <th className="px-5 py-3">Nome do Container</th>
                <th className="px-4 py-3">Imagem</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Portas Mapeadas</th>
                <th className="px-4 py-3">Comando</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? (
                filtered.map((c) => {
                  const isRunning = c.status === 'running';
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name & ID */}
                      <td className="px-5 py-3">
                        <div className="font-mono text-xs font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <Boxes className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{c.name}</span>
                          {c.composeProject && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200">
                              stack: {c.composeProject}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">ID: {c.id}</span>
                      </td>

                      {/* Image */}
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-700 truncate max-w-[180px]">
                        {c.image}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold flex items-center gap-1 ${isRunning ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {isRunning ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-rose-500" />}
                          <span>{c.state || c.status}</span>
                        </span>
                      </td>

                      {/* Ports */}
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-800">
                        {c.ports && c.ports.length > 0 ? (
                          c.ports.map((p, idx) => (
                            <span key={idx} className="mr-2">
                              {p.publicPort ? `${p.publicPort}:` : ''}
                              {p.privatePort}/{p.type}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Command */}
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500 truncate max-w-[160px]">
                        {c.command || '-'}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {(() => {
                            const linkedService = existingServices.find(
                              (s) => s.containerName === c.name || s.containerName === c.id
                            );
                            if (linkedService) {
                              return (
                                <span
                                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0"
                                  title={`Vinculado ao serviço "${linkedService.name}"`}
                                >
                                  Vinculado
                                </span>
                              );
                            }
                            if (onImportContainer) {
                              return (
                                <button
                                  onClick={() => onImportContainer(c)}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold flex items-center gap-1 transition-colors shadow-xs shrink-0"
                                  title="Importar este container como Serviço no Traefik"
                                >
                                  <PlusCircle className="w-3 h-3" />
                                  <span>Importar</span>
                                </button>
                              );
                            }
                            return null;
                          })()}

                          <button
                            onClick={() => onRestart(c.name)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
                            title="Reiniciar Container"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                          {onOpenTerminal && (
                            <button
                              onClick={() => onOpenTerminal(c.name)}
                              className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded"
                              title="Abrir Terminal & SSH"
                            >
                              <Terminal className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => onViewLogs(c.name)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
                            title="Visualizar Logs"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    Nenhum container encontrado.
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
