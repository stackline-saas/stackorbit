import React, { useState } from 'react';
import {
  FolderGit2,
  Plus,
  Server,
  Network,
  Trash2,
  Edit2,
  Layers,
  ArrowRight,
  ShieldCheck,
  Activity,
  AlertCircle,
  X,
  Crown,
  Copy,
  CheckCircle2,
  UserPlus,
} from 'lucide-react';
import type { Project, DockerHost } from '../../types';

interface ProjectsManagementViewProps {
  projects: Project[];
  hosts: DockerHost[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onNavigateToHosts: (projectId: string) => void;
  onRefreshData: () => void;
  showNotification: (type: 'success' | 'error' | 'warning', title: string, message: string) => void;
}

export const ProjectsManagementView: React.FC<ProjectsManagementViewProps> = ({
  projects,
  hosts,
  selectedProjectId,
  onSelectProject,
  onNavigateToHosts,
  onRefreshData,
  showNotification,
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'STANDALONE' | 'SWARM'>('STANDALONE');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Swarm Cluster Modal State
  const [selectedSwarmProject, setSelectedSwarmProject] = useState<Project | null>(null);
  const [swarmNodes, setSwarmNodes] = useState<any[]>([]);
  const [swarmTokens, setSwarmTokens] = useState<{ managerToken?: string; workerToken?: string; managerHost?: any } | null>(null);
  const [loadingSwarmData, setLoadingSwarmData] = useState(false);
  const [isInitializingSwarm, setIsInitializingSwarm] = useState(false);
  const [selectedManagerHostId, setSelectedManagerHostId] = useState('');
  const [selectedWorkerHostId, setSelectedWorkerHostId] = useState('');
  const [isJoiningHost, setIsJoiningHost] = useState(false);

  const openSwarmModal = async (p: Project) => {
    setSelectedSwarmProject(p);
    setLoadingSwarmData(true);
    const pHosts = hosts.filter((h) => h.projectId === p.id);
    setSelectedManagerHostId(pHosts[0]?.id || '');
    const nonManagerHost = pHosts.find((h) => !h.isSwarmManager);
    setSelectedWorkerHostId(nonManagerHost?.id || '');

    try {
      const [tokensRes, nodesRes] = await Promise.all([
        fetch(`/api/projects/${p.id}/swarm/tokens`),
        fetch(`/api/projects/${p.id}/swarm/nodes`),
      ]);
      if (tokensRes.ok) setSwarmTokens(await tokensRes.json());
      if (nodesRes.ok) setSwarmNodes(await nodesRes.json());
    } catch (err: any) {
      console.warn('Erro ao carregar dados do Swarm:', err.message);
    } finally {
      setLoadingSwarmData(false);
    }
  };

  const handleInitSwarm = async (projectId: string) => {
    if (!selectedManagerHostId) {
      showNotification('warning', 'Campo Obrigatório', 'Selecione o servidor que será o nó Manager líder.');
      return;
    }

    setIsInitializingSwarm(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/swarm/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerHostId: selectedManagerHostId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao inicializar Swarm.');

      showNotification('success', 'Swarm Inicializado!', 'Cluster Docker Swarm configurado com sucesso.');
      onRefreshData();
      if (selectedSwarmProject) {
        await openSwarmModal(selectedSwarmProject);
      }
    } catch (err: any) {
      showNotification('error', 'Falha no Swarm', err.message);
    } finally {
      setIsInitializingSwarm(false);
    }
  };

  const handleJoinWorkerHost = async (projectId: string) => {
    if (!selectedWorkerHostId) {
      showNotification('warning', 'Campo Obrigatório', 'Selecione o servidor para ingressar no cluster.');
      return;
    }

    setIsJoiningHost(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/swarm/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerHostId: selectedWorkerHostId, role: 'WORKER' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao unir servidor ao Swarm.');

      showNotification('success', 'Nó Conectado', 'O servidor ingressou no cluster Swarm com sucesso.');
      onRefreshData();
      if (selectedSwarmProject) {
        await openSwarmModal(selectedSwarmProject);
      }
    } catch (err: any) {
      showNotification('error', 'Falha no Join', err.message);
    } finally {
      setIsJoiningHost(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showNotification('success', 'Copiado!', `${label} copiado.`);
  };

  const openCreateModal = () => {
    setEditingProject(null);
    setName('');
    setDescription('');
    setType('STANDALONE');
    setIsCreateModalOpen(true);
  };

  const openEditModal = (p: Project) => {
    setEditingProject(p);
    setName(p.name);
    setDescription(p.description || '');
    setType(p.type);
    setIsCreateModalOpen(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showNotification('warning', 'Campo obrigatório', 'Informe o nome do projeto.');
      return;
    }

    setIsSubmitting(true);
    try {
      const url = editingProject ? `/api/projects/${editingProject.id}` : '/api/projects';
      const method = editingProject ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          type,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao salvar projeto.');
      }

      showNotification(
        'success',
        editingProject ? 'Projeto Atualizado' : 'Projeto Criado',
        `O projeto "${name.trim()}" foi salvo com sucesso.`
      );

      setIsCreateModalOpen(false);
      onRefreshData();
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProject = async (p: Project) => {
    if (p.isDefault) {
      showNotification('warning', 'Ação Bloqueada', 'O Projeto Principal padrão não pode ser excluído.');
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir o projeto "${p.name}"?`)) return;

    try {
      const res = await fetch(`/api/projects/${p.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao excluir projeto.');
      }

      showNotification('success', 'Projeto Removido', `O projeto "${p.name}" foi removido com sucesso.`);
      if (selectedProjectId === p.id) {
        onSelectProject(null);
      }
      onRefreshData();
    } catch (err: any) {
      showNotification('error', 'Erro ao Excluir', err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header com Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FolderGit2 className="w-5 h-5 text-blue-600" />
            <span>Gerenciamento de Projetos</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Organize seus servidores e serviços em projetos dedicados (Standalone ou Clusters Swarm com failover).
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Projeto</span>
        </button>
      </div>

      {/* Grid de Projetos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => {
          const isSelected = selectedProjectId === p.id;
          const projectHosts = hosts.filter((h) => h.projectId === p.id);
          const onlineHosts = projectHosts.filter((h) => h.status === 'ONLINE').length;

          return (
            <div
              key={p.id}
              className={`flex flex-col bg-white rounded-xl border p-4 transition-all shadow-xs ${
                isSelected
                  ? 'border-blue-400 ring-2 ring-blue-100 bg-blue-50/20'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      p.type === 'SWARM' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    {p.type === 'SWARM' ? <Network className="w-4 h-4" /> : <FolderGit2 className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-sm text-slate-900 truncate" title={p.name}>
                      {p.name}
                    </h2>
                    <span className="text-[10px] text-slate-400 font-mono">slug: {p.slug}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {p.isDefault && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      Padrão
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => openSwarmModal(p)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                      p.type === 'SWARM'
                        ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                    title={p.type === 'SWARM' ? 'Ver Cluster Swarm e Nós' : 'Configurar Cluster Swarm'}
                  >
                    <Crown className="w-3 h-3 text-purple-600" />
                    <span>{p.type === 'SWARM' ? 'Cluster Swarm' : 'Standalone'}</span>
                  </button>
                </div>
              </div>

              {p.description && (
                <p className="text-xs text-slate-600 mb-3 line-clamp-2">{p.description}</p>
              )}

              {/* Status de Servidores & Serviços */}
              <div className="grid grid-cols-2 gap-2 py-2.5 px-3 bg-slate-50 rounded-lg text-xs my-2 border border-slate-100">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-medium">Servidores</span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-700 mt-0.5">
                    <Server className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {onlineHosts}/{projectHosts.length} Online
                    </span>
                  </div>
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-medium">Serviços</span>
                  <div className="flex items-center gap-1.5 font-bold text-slate-700 mt-0.5">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    <span>{p.servicesCount ?? 0} ativos</span>
                  </div>
                </div>
              </div>

              {/* Lista compacta de nós */}
              <div className="flex-1 py-1 space-y-1">
                {projectHosts.slice(0, 3).map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between text-[11px] py-1 px-2 rounded bg-white border border-slate-100"
                  >
                    <span className="truncate text-slate-700 font-medium">{h.name}</span>
                    <span
                      className={`inline-flex items-center gap-1 text-[9px] font-bold ${
                        h.status === 'ONLINE' ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          h.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      />
                      {h.status}
                    </span>
                  </div>
                ))}
                {projectHosts.length > 3 && (
                  <div className="text-[10px] text-slate-400 text-center">
                    + {projectHosts.length - 3} outro(s) servidor(es)
                  </div>
                )}
                {projectHosts.length === 0 && (
                  <div className="text-[11px] text-slate-400 italic text-center py-2">
                    Nenhum servidor vinculado
                  </div>
                )}
              </div>

              {/* Rodapé com Ações */}
              <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditModal(p)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                    title="Editar Projeto"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {!p.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(p)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                      title="Excluir Projeto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProject(p.id);
                      showNotification('success', 'Contexto Ativo', `Filtrando visualização pelo projeto "${p.name}".`);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isSelected ? 'Ativo' : 'Selecionar'}
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigateToHosts(p.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md transition-colors"
                  >
                    <span>Servidores</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Criar / Editar Projeto */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-blue-600" />
                <span>{editingProject ? 'Editar Projeto' : 'Novo Projeto'}</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProject} className="p-4 space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Nome do Projeto *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Produção E-commerce, Staging, Home Lab"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Descrição (Opcional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Breve descrição dos serviços e finalidade deste ambiente..."
                  rows={2}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
                  Tipo de Ambiente
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                      type === 'STANDALONE'
                        ? 'border-blue-500 bg-blue-50/50 text-blue-900 font-semibold'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="projType"
                      checked={type === 'STANDALONE'}
                      onChange={() => setType('STANDALONE')}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="text-[11px] leading-tight">
                      <div>Standalone</div>
                      <div className="text-[9px] text-slate-400 font-normal mt-0.5">
                        Nós independentes via SSH ou Docker Socket
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                      type === 'SWARM'
                        ? 'border-purple-500 bg-purple-50/50 text-purple-900 font-semibold'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="projType"
                      checked={type === 'SWARM'}
                      onChange={() => setType('SWARM')}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div className="text-[11px] leading-tight">
                      <div>Docker Swarm</div>
                      <div className="text-[9px] text-slate-400 font-normal mt-0.5">
                        Cluster orquestrado com rede overlay e réplicas
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : editingProject ? 'Salvar Alterações' : 'Criar Projeto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Orquestração Docker Swarm do Projeto */}
      {selectedSwarmProject && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-purple-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Crown className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    Cluster Docker Swarm • {selectedSwarmProject.name}
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    Gerenciamento nativo de nós, alta disponibilidade e rede overlay.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSwarmProject(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto">
              {loadingSwarmData ? (
                <div className="py-12 text-center text-slate-400">
                  <Activity className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-600" />
                  <span className="text-xs">Consultando cluster Swarm...</span>
                </div>
              ) : !swarmTokens?.workerToken && swarmNodes.length === 0 ? (
                // Cluster ainda não inicializado
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div>
                    <h4 className="font-bold text-xs text-slate-800">Inicializar Cluster Docker Swarm</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Este projeto ainda não possui um cluster Swarm inicializado. Selecione o servidor principal para assumir o papel de Manager líder.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Servidor Manager Líder *
                    </label>
                    <select
                      value={selectedManagerHostId}
                      onChange={(e) => setSelectedManagerHostId(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                    >
                      {hosts
                        .filter((h) => h.projectId === selectedSwarmProject.id)
                        .map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} ({h.type} - {h.endpointUrl})
                          </option>
                        ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleInitSwarm(selectedSwarmProject.id)}
                    disabled={isInitializingSwarm || !selectedManagerHostId}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>{isInitializingSwarm ? 'Inicializando...' : 'Inicializar Cluster Swarm'}</span>
                  </button>
                </div>
              ) : (
                // Cluster Ativo: Comandos de Join e Lista de Nós
                <>
                  {/* Comando de Join Worker */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                        <span>Comando de Adesão para Nós Workers</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const cmd = `docker swarm join --token ${swarmTokens?.workerToken} ${
                            swarmTokens?.managerHost?.endpointUrl.replace('ssh://root@', '').replace('ssh://', '') || '127.0.0.1'
                          }:2377`;
                          copyToClipboard(cmd, 'Comando Swarm Join');
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 hover:text-purple-700"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copiar Comando</span>
                      </button>
                    </div>

                    <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl font-mono text-[11px] overflow-x-auto whitespace-pre-wrap border border-slate-800">
                      {`docker swarm join --token ${swarmTokens?.workerToken || '...'} ${
                        swarmTokens?.managerHost?.endpointUrl.replace('ssh://root@', '').replace('ssh://', '') || '127.0.0.1'
                      }:2377`}
                    </pre>
                  </div>

                  {/* Tabela de Nós do Cluster */}
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-700 mb-2 flex items-center justify-between">
                      <span>Nós Conectados ({swarmNodes.length})</span>
                      <button
                        type="button"
                        onClick={() => openSwarmModal(selectedSwarmProject)}
                        className="text-[10px] font-medium text-purple-600 hover:underline"
                      >
                        Atualizar Nós
                      </button>
                    </h4>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3">Hostname / ID</th>
                            <th className="py-2 px-3">Papel (Role)</th>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 px-3">Engine</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {swarmNodes.map((n) => (
                            <tr key={n.id} className="hover:bg-slate-50/50">
                              <td className="py-2 px-3 font-medium text-slate-800 flex items-center gap-1.5">
                                {n.leader && <Crown className="w-3 h-3 text-purple-600 shrink-0" />}
                                <span className="truncate">{n.hostname}</span>
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                    n.role === 'manager'
                                      ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                                  }`}
                                >
                                  {n.role}
                                </span>
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] font-bold ${
                                    n.status === 'ready' ? 'text-emerald-600' : 'text-rose-600'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      n.status === 'ready' ? 'bg-emerald-500' : 'bg-rose-500'
                                    }`}
                                  />
                                  {n.status}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-[10px] text-slate-500 font-mono">
                                {n.engineVersion ? `v${n.engineVersion}` : '-'}
                              </td>
                            </tr>
                          ))}

                          {swarmNodes.length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-4 text-center text-slate-400 italic text-[11px]">
                                Nenhum nó remoto conectado ao Swarm ainda.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Adicionar Servidor Existente do Projeto como Worker */}
                  {hosts.filter((h) => h.projectId === selectedSwarmProject.id && !h.isSwarmManager).length > 0 && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <h4 className="text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                        <UserPlus className="w-3.5 h-3.5 text-purple-600" />
                        <span>Unir Servidor Existente ao Cluster</span>
                      </h4>
                      <p className="text-[10px] text-slate-400 mb-2">
                        Execute a integração automática sem precisar rodar comandos manuais no terminal.
                      </p>

                      <div className="flex items-center gap-2">
                        <select
                          value={selectedWorkerHostId}
                          onChange={(e) => setSelectedWorkerHostId(e.target.value)}
                          className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white"
                        >
                          {hosts
                            .filter((h) => h.projectId === selectedSwarmProject.id && !h.isSwarmManager)
                            .map((h) => (
                              <option key={h.id} value={h.id}>
                                {h.name} ({h.type})
                              </option>
                            ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => handleJoinWorkerHost(selectedSwarmProject.id)}
                          disabled={isJoiningHost || !selectedWorkerHostId}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          {isJoiningHost ? 'Conectando...' : 'Unir ao Swarm'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedSwarmProject(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors shadow-2xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
