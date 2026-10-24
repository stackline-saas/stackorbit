import React from 'react';
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
  ExternalLink,
  FolderGit2,
  HardDrive,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import type { ActiveTab } from '../types/index.ts';
export type { ActiveTab };

interface SidebarProps {
  currentTab?: ActiveTab;
  onSelectTab?: (tab: ActiveTab) => void;
  servicesCount: number;
  domainsCount: number;
  dockerConnected: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  servicesCount,
  domainsCount,
  dockerConnected,
}) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const pathname = location.pathname;

  const navigationItems = [
    { id: 'dashboard' as ActiveTab, path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'projects' as ActiveTab, path: '/projects', label: 'Projetos', icon: FolderGit2 },
    { id: 'hosts' as ActiveTab, path: '/hosts', label: 'Servidores', icon: HardDrive },
    { id: 'services' as ActiveTab, path: '/services', label: 'Serviços', icon: Server, count: servicesCount },
    { id: 'domains' as ActiveTab, path: '/domains', label: 'Domínios', icon: Globe, count: domainsCount },
    { id: 'default-service' as ActiveTab, path: '/default-service', label: 'Serviço Padrão', icon: Compass },
    { id: 'containers' as ActiveTab, path: '/containers', label: 'Containers', icon: Boxes },
    { id: 'integrations' as ActiveTab, path: '/integrations', label: 'Integrações Git', icon: GitBranch },
    { id: 'traefik' as ActiveTab, path: '/traefik', label: 'Traefik & Proxy', icon: Route },
    { id: 'cloudflare' as ActiveTab, path: '/cloudflare', label: 'Cloudflare & SSL', icon: ShieldCheck },
    { id: 'audit' as ActiveTab, path: '/audit', label: 'Auditoria & Logs', icon: FileText },
    { id: 'tests' as ActiveTab, path: '/tests', label: 'Testes do Sistema', icon: CheckSquare },
    { id: 'settings' as ActiveTab, path: '/settings', label: 'Configurações', icon: Settings },
  ];

  const checkIsActive = (item: (typeof navigationItems)[0]) => {
    if (item.path === '/dashboard') {
      return pathname === '/' || pathname === '/dashboard';
    }
    return pathname.startsWith(item.path);
  };

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm tracking-tighter group-hover:bg-blue-500 transition-colors">
            DM
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight whitespace-nowrap group-hover:text-blue-400 transition-colors">
              Docker Domain
            </h1>
            <p className="text-[11px] text-slate-400">Traefik + Cloudflare</p>
          </div>
        </Link>
      </div>

      {/* Engine Status Bar */}
      <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-[11px]">
        <span className="text-slate-400">Docker Engine</span>
        <span className="font-mono text-emerald-400 font-medium">
          {dockerConnected ? 'Conectado' : 'Desconectado'}
        </span>
      </div>

      {/* Nav List */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = checkIsActive(item);
          return (
            <Link
              key={item.id}
              to={item.path}
              onClick={() => onSelectTab && onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
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
        })}
      </nav>

      {/* Cloudflare Quick Note */}
      <div className="mx-3 my-2 p-2.5 rounded bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
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
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors shrink-0"
            title="Encerrar Sessão"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
