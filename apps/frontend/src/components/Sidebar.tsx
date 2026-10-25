import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  Globe,
  Compass,
  Boxes,
  GitBranch,
  Route,
  ShieldCheck,
  FileText,
  CheckSquare,
  Settings,
  LogOut,
  FolderGit2,
  HardDrive,
  Crown,
  ChevronsUpDown,
  Check,
  Plus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import type { ActiveTab, Project, DockerHost } from '../types/index.ts';
export type { ActiveTab };

interface SidebarProps {
  currentTab?: ActiveTab;
  onSelectTab?: (tab: ActiveTab) => void;
  servicesCount: number;
  domainsCount: number;
  dockerConnected: boolean;
  projects?: Project[];
  hosts?: DockerHost[];
  selectedProjectId?: string | null;
  onSelectProject?: (projectId: string | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  servicesCount,
  domainsCount,
  dockerConnected,
  projects = [],
  hosts = [],
  selectedProjectId,
  onSelectProject,
}) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const pathname = location.pathname;

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentProjectHostsCount = selectedProjectId
    ? hosts.filter((h) => h.projectId === selectedProjectId).length
    : 0;

  // 1. Itens Escopados ao Projeto Selecionado
  const projectNavigationItems = [
    {
      id: 'hosts' as ActiveTab,
      path: '/hosts',
      label: 'Servidores & Nós',
      icon: HardDrive,
      count: currentProjectHostsCount,
    },
    {
      id: 'services' as ActiveTab,
      path: '/services',
      label: 'Serviços',
      icon: Server,
      count: servicesCount,
    },
    {
      id: 'domains' as ActiveTab,
      path: '/domains',
      label: 'Domínios',
      icon: Globe,
      count: domainsCount,
    },
    {
      id: 'containers' as ActiveTab,
      path: '/containers',
      label: 'Containers',
      icon: Boxes,
    },
    {
      id: 'default-service' as ActiveTab,
      path: '/default-service',
      label: 'Serviço Padrão (Fallback)',
      icon: Compass,
    },
    {
      id: 'integrations' as ActiveTab,
      path: '/integrations',
      label: 'Integrações Git',
      icon: GitBranch,
    },
    {
      id: 'traefik' as ActiveTab,
      path: '/traefik',
      label: 'Traefik & Proxy',
      icon: Route,
    },
    {
      id: 'cloudflare' as ActiveTab,
      path: '/cloudflare',
      label: 'Cloudflare & SSL',
      icon: ShieldCheck,
    },
    {
      id: 'settings' as ActiveTab,
      path: '/settings',
      label: 'Configurações',
      icon: Settings,
    },
  ];

  // 2. Itens Globais e Comuns a todos os projetos (Administração Global)
  const globalNavigationItems = [
    { id: 'dashboard' as ActiveTab, path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'projects' as ActiveTab, path: '/projects', label: 'Projetos', icon: FolderGit2, count: projects.length },
    { id: 'audit' as ActiveTab, path: '/audit', label: 'Auditoria & Logs', icon: FileText },
    { id: 'tests' as ActiveTab, path: '/tests', label: 'Testes do Sistema', icon: CheckSquare },
  ];

  const checkIsActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === '/' || pathname === '/dashboard';
    }
    return pathname.startsWith(path);
  };

  const renderNavLink = (item: {
    id: ActiveTab;
    path: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }) => {
    const Icon = item.icon;
    const isActive = checkIsActive(item.path);
    return (
      <Link
        key={item.id}
        to={item.path}
        onClick={() => onSelectTab && onSelectTab(item.id)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
          isActive
            ? 'bg-blue-600 text-white font-semibold shadow-xs'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <div className="flex items-center gap-2.5 truncate">
          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
          <span className="truncate">{item.label}</span>
        </div>
        {item.count !== undefined && (
          <span
            className={`text-[11px] px-1.5 py-0.2 rounded font-mono tabular-nums ${
              isActive ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {item.count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
        <Link to="/dashboard" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm tracking-tighter group-hover:bg-blue-500 transition-colors shadow-xs">
            DM
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight whitespace-nowrap group-hover:text-blue-400 transition-colors">
              StackOrbit
            </h1>
            <p className="text-[10px] text-slate-400">Multi-Host & Multi-Projeto</p>
          </div>
        </Link>
      </div>

      {/* Engine Status Bar */}
      <div className="px-4 py-2 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between text-[11px]">
        <span className="text-slate-400">Docker Engine</span>
        <span className="font-mono text-emerald-400 font-medium flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>{dockerConnected ? 'Conectado' : 'Desconectado'}</span>
        </span>
      </div>

      {/* Nav List com Ordem: Projeto Ativo EM CIMA, Global EM BAIXO */}
      <nav className="flex-1 p-2.5 space-y-3 overflow-y-auto">
        {/* PARTE 1 (EM CIMA): PROJETO ATIVO & SEUS RECURSOS */}
        <div>
          <div className="flex items-center justify-between px-2.5 pb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${selectedProject ? 'bg-blue-500 animate-pulse' : 'bg-slate-500'}`} />
              <span>{selectedProject ? 'Projeto Ativo' : 'Projeto'}</span>
            </span>
          </div>

          {/* Seletor & Switcher de Projeto Interativo */}
          <div className="relative mb-2" ref={dropdownRef}>
            {selectedProject ? (
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full text-left p-2.5 rounded-xl bg-gradient-to-b from-slate-850 to-slate-900 border border-blue-500/40 hover:border-blue-400/70 transition-all shadow-xs group"
                title="Clique para alternar de projeto"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        selectedProject.type === 'SWARM'
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}
                    >
                      {selectedProject.type === 'SWARM' ? (
                        <Crown className="w-4 h-4 text-purple-400" />
                      ) : (
                        <FolderGit2 className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-white truncate group-hover:text-blue-300 transition-colors">
                        {selectedProject.name}
                      </h4>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                            selectedProject.type === 'SWARM'
                              ? 'bg-purple-900/50 text-purple-300 border-purple-700/50'
                              : 'bg-blue-900/50 text-blue-300 border-blue-700/50'
                          }`}
                        >
                          {selectedProject.type === 'SWARM' ? 'Swarm' : 'Standalone'}
                        </span>
                        {selectedProject.isDefault && (
                          <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-900/50 text-amber-300 border border-amber-700/50">
                            Padrão
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <ChevronsUpDown className="w-4 h-4 text-slate-400 group-hover:text-white shrink-0 transition-colors" />
                </div>
              </button>
            ) : (
              /* Se NÃO tiver projeto selecionado */
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full text-left p-3 rounded-xl bg-slate-950/80 border border-dashed border-slate-700 hover:border-blue-500 transition-all group flex items-center justify-between"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FolderGit2 className="w-5 h-5 text-slate-400 group-hover:text-blue-400 transition-colors shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">
                      Selecionar um Projeto
                    </p>
                    <p className="text-[10px] text-slate-500">Clique para escolher o projeto</p>
                  </div>
                </div>
                <ChevronsUpDown className="w-4 h-4 text-slate-400 group-hover:text-white shrink-0" />
              </button>
            )}

            {/* Menu Dropdown de Seleção de Projeto */}
            {isDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 max-h-64 overflow-y-auto">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Projetos Disponíveis
                </div>

                <div className="divide-y divide-slate-850">
                  {projects.map((p) => {
                    const isSelected = selectedProject?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onSelectProject && onSelectProject(p.id);
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs transition-colors hover:bg-slate-850 ${
                          isSelected ? 'bg-slate-800/80 text-white font-semibold' : 'text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {p.type === 'SWARM' ? (
                            <Crown className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          ) : (
                            <FolderGit2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          )}
                          <span className="truncate">{p.name}</span>
                        </div>

                        {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}

                  {projects.length === 0 && (
                    <div className="px-3 py-2 text-xs text-slate-500 italic">
                      Nenhum projeto cadastrado
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-800 mt-1 pt-1 px-1.5">
                  <Link
                    to="/projects"
                    onClick={() => {
                      onSelectTab && onSelectTab('projects');
                      setIsDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold text-blue-400 hover:text-blue-300 hover:bg-slate-850 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Gerenciar / Criar Projetos</span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Menu dos recursos: estritamente renderizado APENAS quando há um projeto selecionado */}
          {selectedProject && (
            <div className="space-y-0.5">
              {projectNavigationItems.map(renderNavLink)}
            </div>
          )}
        </div>

        {/* PARTE 2 (EM BAIXO): ADMINISTRAÇÃO GLOBAL COM SEPARAÇÃO */}
        <div className="pt-2 border-t border-slate-800">
          <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Administração Global
          </div>
          <div className="space-y-0.5">
            {globalNavigationItems.map(renderNavLink)}
          </div>
        </div>
      </nav>

      {/* Cloudflare Quick Note */}
      <div className="mx-3 my-2 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
        <div className="flex items-center gap-1.5 text-amber-400 font-medium mb-1">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span>SSL Gerenciado</span>
        </div>
        Cloudflare Full (strict) ativo. Certificados emitidos pela Origin CA.
      </div>

      {/* User Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-slate-700 text-slate-200 flex items-center justify-center text-xs font-bold shrink-0">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name || 'Administrador'}</p>
              <p className="text-[10px] text-slate-400 truncate">{user?.email || 'admin@bla.com.br'}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md hover:bg-slate-800 transition-colors shrink-0"
            title="Encerrar Sessão"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
