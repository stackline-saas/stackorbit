import React from 'react';
import { Route, RefreshCw, Shield, Terminal } from 'lucide-react';
import type { ActiveTab } from './Sidebar.tsx';

interface HeaderProps {
  currentTab: ActiveTab;
  onRefresh: () => void;
  isRefreshing: boolean;
  onApplyTraefik: () => void;
  isApplyingTraefik: boolean;
  projectSelectorSlot?: React.ReactNode;
}

const tabTitles: Record<ActiveTab, { title: string; category: string }> = {
  dashboard: { title: 'Visão Geral', category: 'Monitoramento' },
  projects: { title: 'Gerenciamento de Projetos', category: 'Orquestração' },
  hosts: { title: 'Servidores & Nós Docker', category: 'Infraestrutura' },
  services: { title: 'Serviços e Containers', category: 'Infraestrutura' },
  'service-detail': { title: 'Configuração do Serviço', category: 'Serviços' },
  domains: { title: 'Roteamento de Domínios', category: 'Roteamento' },
  'default-service': { title: 'Serviço Padrão (Catch-All)', category: 'Roteamento' },
  containers: { title: 'Docker Engine Containers', category: 'Infraestrutura' },
  traefik: { title: 'Configuração do Traefik', category: 'Proxy Reverso' },
  cloudflare: { title: 'Cloudflare & SSL Origem', category: 'Segurança' },
  audit: { title: 'Auditoria de Alterações', category: 'Governança' },
  tests: { title: 'Validação e Testes', category: 'Diagnóstico' },
  settings: { title: 'Configurações do Sistema', category: 'Sistema' },
};

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onRefresh,
  isRefreshing,
  onApplyTraefik,
  isApplyingTraefik,
  projectSelectorSlot,
}) => {
  const current = tabTitles[currentTab] || { title: 'Painel', category: 'Visão Geral' };

  return (
    <header className="h-14 border-b border-slate-200 bg-white px-6 flex items-center justify-between gap-8 shrink-0">
      {/* Zone 1: Breadcrumbs & Section Title & Project Selector */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium whitespace-nowrap">{current.category}</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900 font-semibold text-sm whitespace-nowrap">{current.title}</span>
        </div>
        {projectSelectorSlot}
      </div>

      {/* Zone 2: Informational context links */}
      <div className="hidden lg:flex items-center gap-5 text-xs text-slate-500">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <Shield className="w-3.5 h-3.5 text-blue-600" />
          <span>Cloudflare Full (strict)</span>
        </div>
        <span className="text-slate-200">·</span>
        <div className="flex items-center gap-1.5 whitespace-nowrap font-mono">
          <Terminal className="w-3.5 h-3.5 text-slate-400" />
          <span>Traefik v3 Dynamic</span>
        </div>
      </div>

      {/* Zone 3: Primary Action Controls */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md border border-slate-200 text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
          title="Recarregar dados"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>

        <button
          onClick={onApplyTraefik}
          disabled={isApplyingTraefik}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors whitespace-nowrap disabled:opacity-50"
        >
          <Route className={`w-3.5 h-3.5 ${isApplyingTraefik ? 'animate-spin' : ''}`} />
          <span>{isApplyingTraefik ? 'Sincronizando...' : 'Aplicar no Traefik'}</span>
        </button>
      </div>
    </header>
  );
};
