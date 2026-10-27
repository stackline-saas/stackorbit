import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe,
  Plus,
  FolderOpen,
  Key,
  ExternalLink,
  RefreshCw,
  Search,
  Database,
  Trash2,
  Settings,
  Code,
  Layout,
  ShoppingBag,
  Sparkles,
  Server,
  Layers,
  X,
} from 'lucide-react';
import type { Service, Project } from '../../types/index.ts';
import { CreateSiteModal } from '../CreateSiteModal.tsx';
import { SiteSFTPModal } from '../SiteSFTPModal.tsx';
import { SiteFileManager } from '../SiteFileManager.tsx';

interface SitesViewProps {
  selectedProjectId?: string | null;
  projects?: Project[];
  mainDomain?: string;
  onRefresh?: () => void;
}

export const SitesView: React.FC<SitesViewProps> = ({
  selectedProjectId,
  projects = [],
  mainDomain = 'bla.com.br',
  onRefresh,
}) => {
  const navigate = useNavigate();
  const [sites, setSites] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  // Modais
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [sftpModalData, setSftpModalData] = useState<{ id: string; name: string } | null>(null);
  const [fileManagerModalSite, setFileManagerModalSite] = useState<{ id: string; name: string } | null>(null);

  const loadSites = async () => {
    setIsLoading(true);
    try {
      const url = selectedProjectId
        ? `/api/sites?projectId=${encodeURIComponent(selectedProjectId)}`
        : '/api/sites';

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });

      if (res.ok) {
        const data = await res.json();
        setSites(data || []);
      }
    } catch (err) {
      console.error('Erro ao carregar sites:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSites();
  }, [selectedProjectId]);

  const handleDeleteSite = async (site: Service) => {
    if (!window.confirm(`Tem certeza que deseja excluir o site "${site.name}"? Todos os containers e dados serão removidos.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/services/${site.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });
      if (res.ok) {
        loadSites();
        onRefresh?.();
      }
    } catch (err) {
      console.error('Erro ao excluir site:', err);
    }
  };

  // Filtro de sites
  const filteredSites = sites.filter((site) => {
    const matchSearch =
      site.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      site.containerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      site.domains?.some((d) => d.domainName.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchSearch) return false;

    if (filterType === 'all') return true;
    const lowerNotes = (site.notes || '').toLowerCase();
    const lowerImg = (site.image || '').toLowerCase();

    if (filterType === 'static') return lowerNotes.includes('estático') || lowerImg.includes('nginx');
    if (filterType === 'php') return lowerNotes.includes('php') || lowerImg.includes('php');
    if (filterType === 'wordpress') return lowerNotes.includes('wordpress') || lowerImg.includes('wordpress');
    if (filterType === 'ecommerce') return lowerNotes.includes('prestashop') || lowerImg.includes('prestashop');

    return true;
  });

  const getSiteBadge = (site: Service) => {
    const notes = (site.notes || '').toLowerCase();
    const img = (site.image || '').toLowerCase();

    if (notes.includes('wordpress') || img.includes('wordpress')) {
      return {
        label: 'WordPress CMS',
        icon: Layout,
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        hasDb: true,
      };
    }
    if (notes.includes('prestashop') || img.includes('prestashop')) {
      return {
        label: 'E-commerce',
        icon: ShoppingBag,
        color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        hasDb: true,
      };
    }
    if (notes.includes('php') || img.includes('php')) {
      return {
        label: 'PHP 8.2 Dinâmico',
        icon: Code,
        color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        hasDb: false,
      };
    }
    return {
      label: 'Site Estático (Nginx)',
      icon: Globe,
      color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      hasDb: false,
    };
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-slate-900">Sites Web & CMS</h1>
            <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/60 rounded-full">
              {sites.length} {sites.length === 1 ? 'site' : 'sites'}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Crie e gerencie sites estáticos, PHP, WordPress e lojas virtuais com gerenciador de arquivos web e SFTP.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadSites}
            disabled={isLoading}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition-all"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Site Web</span>
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, domínio ou container..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'static', label: 'Estáticos' },
            { id: 'php', label: 'PHP' },
            { id: 'wordpress', label: 'WordPress' },
            { id: 'ecommerce', label: 'Lojas' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
                filterType === tab.id
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sites Grid */}
      {isLoading && sites.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
          <p className="font-semibold text-slate-700 text-sm">Carregando seus sites...</p>
        </div>
      ) : filteredSites.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-3xl border border-slate-200 shadow-2xs p-8">
          <Globe className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <h3 className="font-bold text-slate-800 text-base mb-1">Nenhum site encontrado</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-5 leading-relaxed">
            Crie seu primeiro site estático, página em PHP ou blog WordPress com 1 clique. Gerencie os arquivos direto pelo navegador ou via FileZilla com SFTP.
          </p>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Meu Primeiro Site</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSites.map((site) => {
            const badge = getSiteBadge(site);
            const BadgeIcon = badge.icon;
            const primaryDomain = site.domains?.[0]?.domainName;

            return (
              <div
                key={site.id}
                className="bg-white rounded-3xl border border-slate-200/80 hover:border-slate-300 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
              >
                {/* Card Top */}
                <div className="p-5">
                  {/* Badges & Status */}
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-xl border ${badge.color}`}
                    >
                      <BadgeIcon className="w-3.5 h-3.5" />
                      <span>{badge.label}</span>
                    </span>

                    <div className="flex items-center gap-1.5">
                      {site.meta?.hasPendingChanges ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md flex items-center gap-1 animate-pulse" title="Existem alterações salvas aguardando publicação no container">
                          ● Aguardando Publicação
                        </span>
                      ) : site.meta?.lastPublishedAt ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md flex items-center gap-1" title={`Publicado em ${new Date(site.meta.lastPublishedAt).toLocaleString('pt-BR')}`}>
                          ✓ No Ar ({new Date(site.meta.lastPublishedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})
                        </span>
                      ) : null}
                      {badge.hasDb && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md flex items-center gap-1">
                          <Database className="w-2.5 h-2.5" /> MariaDB
                        </span>
                      )}
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          site.status === 'running' ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                        title={site.status === 'running' ? 'Executando' : 'Parado'}
                      />
                    </div>
                  </div>

                  {/* Title & Container */}
                  <h3 className="font-bold text-slate-900 text-base mb-1 group-hover:text-blue-600 transition-colors truncate">
                    {site.name}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mb-4 truncate">{site.containerName}</p>

                  {/* Domain Link */}
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate">
                      <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                      {primaryDomain ? (
                        <a
                          href={`https://${primaryDomain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-blue-600 hover:underline truncate"
                        >
                          {primaryDomain}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">Sem domínio associado</span>
                      )}
                    </div>

                    {primaryDomain && (
                      <a
                        href={`https://${primaryDomain}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                        title="Abrir no navegador"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  {/* Detalhes de Publicação no Cadastro do Site */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Última publicação:</span>
                    <span className="font-semibold text-slate-700">
                      {site.meta?.lastPublishedAt
                        ? new Date(site.meta.lastPublishedAt).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Ainda não publicado'}
                    </span>
                  </div>

                  {site.meta?.hasPendingChanges && (
                    <div className="mt-2 px-2.5 py-1.5 bg-amber-50 border border-amber-200/80 rounded-xl flex items-center justify-between text-[11px] text-amber-800 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        Alterações pendentes de publicação
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate(`/sites/${site.id}/files`)}
                        className="text-[10px] font-bold text-amber-900 underline hover:text-amber-700"
                      >
                        Publicar
                      </button>
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {/* Botão Gerenciador de Arquivos & Editor VS Code */}
                    <button
                      type="button"
                      onClick={() => navigate(`/sites/${site.id}/files`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-2xs transition-colors"
                      title="Abrir Gerenciador de Arquivos & Editor VS Code"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-blue-600" />
                      <span>Arquivos</span>
                    </button>

                    {/* Botão SFTP */}
                    <button
                      type="button"
                      onClick={() => setSftpModalData({ id: site.id, name: site.name })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-2xs transition-colors"
                      title="Acesso SFTP para FileZilla"
                    >
                      <Key className="w-3.5 h-3.5 text-purple-600" />
                      <span>SFTP</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Detalhes do Serviço */}
                    <button
                      type="button"
                      onClick={() => navigate(`/services/${site.id}`)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition-colors"
                      title="Configurações do Site"
                    >
                      <Settings className="w-4 h-4" />
                    </button>

                    {/* Excluir Site */}
                    <button
                      type="button"
                      onClick={() => handleDeleteSite(site)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir Site"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Criação de Site */}
      {isCreateModalOpen && (
        <CreateSiteModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={() => {
            loadSites();
            onRefresh?.();
          }}
          mainDomain={mainDomain}
          projectId={selectedProjectId}
        />
      )}

      {/* Modal de Credenciais SFTP */}
      {sftpModalData && (
        <SiteSFTPModal
          isOpen={!!sftpModalData}
          onClose={() => setSftpModalData(null)}
          serviceId={sftpModalData.id}
          serviceName={sftpModalData.name}
        />
      )}

      {/* Modal Dedicado de Gerenciador de Arquivos & Editor Web */}
      {fileManagerModalSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden">
            {/* Header do Modal */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>Gerenciador de Arquivos & Editor</span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md">
                      {fileManagerModalSite.name}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Navegue nas pastas, faça upload, extraia ZIPs e edite seus arquivos com syntax highlighting
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const targetId = fileManagerModalSite.id;
                    setFileManagerModalSite(null);
                    navigate(`/services/${targetId}?tab=files`);
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-white border border-transparent hover:border-slate-200 rounded-xl transition-all flex items-center gap-1.5 shadow-2xs"
                  title="Abrir como tela cheia na página do serviço"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Página do Serviço</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFileManagerModalSite(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Conteúdo do Gerenciador de Arquivos */}
            <div className="flex-1 p-6 overflow-y-auto bg-slate-50/30">
              <SiteFileManager
                serviceId={fileManagerModalSite.id}
                serviceName={fileManagerModalSite.name}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
