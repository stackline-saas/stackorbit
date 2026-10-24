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
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                      p.type === 'SWARM'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    {p.type === 'SWARM' ? 'Cluster Swarm' : 'Standalone'}
                  </span>
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
    </div>
  );
};
