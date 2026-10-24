import React, { useState, useEffect } from 'react';
import {
  X,
  Boxes,
  Layers,
  ArrowRight,
  Globe,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Server,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useNotification } from '../context/NotificationContext.tsx';
import type { ComposeProjectSummary, Service } from '../types/index.ts';

interface ImportComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (service: Service) => void;
}

export const ImportComposeModal: React.FC<ImportComposeModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const { authFetch } = useAuth();
  const { showNotification } = useNotification();

  const [isLoading, setIsLoading] = useState(false);
  const [projects, setProjects] = useState<ComposeProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<ComposeProjectSummary | null>(null);

  // Form parameters for selected project import
  const [serviceName, setServiceName] = useState('');
  const [primaryContainer, setPrimaryContainer] = useState('');
  const [internalPort, setInternalPort] = useState(80);
  const [domainName, setDomainName] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const fetchComposeProjects = async () => {
    setIsLoading(true);
    try {
      const res = await authFetch('/api/services/compose/discover');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      } else {
        const err = await res.json();
        showNotification('error', 'Falha ao buscar projetos Compose', err.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchComposeProjects();
      setSelectedProject(null);
    }
  }, [isOpen]);

  const handleSelectProject = (proj: ComposeProjectSummary) => {
    setSelectedProject(proj);
    setServiceName(proj.projectName);
    setPrimaryContainer(proj.suggestedContainerName || proj.containers[0]?.name || '');
    setInternalPort(proj.suggestedPort || 80);
    setDomainName(`${proj.projectName}.local`);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !primaryContainer || !internalPort) return;

    setIsImporting(true);
    try {
      const res = await authFetch('/api/services/compose/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: selectedProject.projectName,
          name: serviceName.trim() || selectedProject.projectName,
          primaryContainerName: primaryContainer,
          internalPort: Number(internalPort),
          domainName: domainName.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showNotification(
          'success',
          'Stack Importada com Sucesso!',
          `O projeto Compose "${selectedProject.projectName}" com ${selectedProject.containersCount} containers foi importado e conectado ao proxy Traefik.`
        );
        onImportSuccess(data.service);
        onClose();
      } else {
        showNotification('error', 'Falha ao importar', data.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Importar Projeto Docker Compose</h2>
              <p className="text-xs text-slate-500">
                Detecta stacks e projetos multi-container rodando no host e os cadastra como Serviço unificado.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchComposeProjects}
              disabled={isLoading}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-md transition-colors"
              title="Recarregar projetos Docker Compose"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="py-16 text-center">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-600 font-medium">Escaneando containers e stacks Docker Compose...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
              <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-800">Nenhum projeto Compose detectado</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Não encontramos nenhum container ativo com labels do Docker Compose (<code className="text-slate-700">com.docker.compose.project</code>). Certifique-se de que subiu seus containers com <code className="text-slate-700">docker compose up -d</code>.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Projetos Compose Encontrados ({projects.length})
              </div>

              {/* Projects List */}
              <div className="grid grid-cols-1 gap-3">
                {projects.map((proj) => {
                  const isSelected = selectedProject?.projectName === proj.projectName;
                  return (
                    <div
                      key={proj.projectName}
                      className={`p-4 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 font-mono">
                              {proj.projectName}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800">
                              {proj.containersCount} container{proj.containersCount > 1 ? 's' : ''}
                            </span>
                            {proj.isImported && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Já Importado
                              </span>
                            )}
                          </div>
                          {proj.workingDir && (
                            <p className="text-xs text-slate-500 font-mono truncate max-w-lg">
                              Diretório: {proj.workingDir}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            {proj.containers.map((c) => (
                              <span
                                key={c.id}
                                className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-mono flex items-center gap-1"
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    c.status === 'running' ? 'bg-emerald-500' : 'bg-slate-400'
                                  }`}
                                />
                                {c.composeService || c.name}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <button
                            type="button"
                            onClick={() => handleSelectProject(proj)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                            }`}
                          >
                            <span>{isSelected ? 'Selecionado' : 'Configurar Importação'}</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Import Configuration Form */}
              {selectedProject && (
                <form
                  onSubmit={handleImport}
                  className="mt-6 p-5 bg-slate-50 rounded-xl border border-blue-200 space-y-4 animate-in fade-in duration-200"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-900 border-b border-blue-100 pb-2">
                    <Server className="w-4 h-4 text-blue-600" />
                    <span>Configurar Serviço para "{selectedProject.projectName}"</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Nome do Serviço
                      </label>
                      <input
                        type="text"
                        required
                        value={serviceName}
                        onChange={(e) => setServiceName(e.target.value)}
                        placeholder="Ex: Minha Stack"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Domínio para Roteamento (Opcional)
                      </label>
                      <div className="relative">
                        <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={domainName}
                          onChange={(e) => setDomainName(e.target.value)}
                          placeholder="app.seudominio.com ou nome.local"
                          className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Container Principal (Roteador HTTP / Traefik)
                      </label>
                      <select
                        value={primaryContainer}
                        onChange={(e) => {
                          setPrimaryContainer(e.target.value);
                          const chosen = selectedProject.containers.find((c) => c.name === e.target.value);
                          const p = chosen?.ports?.find((port) => port.privatePort)?.privatePort;
                          if (p) setInternalPort(p);
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      >
                        {selectedProject.containers.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name} {c.composeService ? `(${c.composeService})` : ''} - {c.image}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500 mt-1">
                        O container que receberá as requisições HTTP do proxy (ex: frontend, nginx, web, api).
                      </p>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Porta Interna do Container Principal
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        max="65535"
                        value={internalPort}
                        onChange={(e) => setInternalPort(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-medium"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Porta onde a aplicação escuta internamente (ex: 80, 3000, 8080, 9001).
                      </p>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      Ao importar, todos os containers da stack ({selectedProject.containers.map((c) => c.composeService || c.name).join(', ')}) serão conectados à rede <code className="font-semibold text-blue-950">proxy-net</code> sem interrupção de volumes ou bancos de dados.
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedProject(null)}
                      className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isImporting}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
                    >
                      <Boxes className={`w-4 h-4 ${isImporting ? 'animate-spin' : ''}`} />
                      <span>{isImporting ? 'Importando Stack...' : 'Concluir Importação da Stack'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
