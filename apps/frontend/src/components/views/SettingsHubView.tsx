import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Settings,
  Compass,
  GitBranch,
  Route,
  ShieldCheck,
} from 'lucide-react';
import type { Service, Domain } from '../../types/index.ts';
import { SettingsView } from './SettingsView.tsx';
import { DefaultServiceView } from './DefaultServiceView.tsx';
import { IntegrationsView } from './IntegrationsView.tsx';
import { TraefikView } from './TraefikView.tsx';
import { CloudflareView } from './CloudflareView.tsx';

export type SettingsTab = 'general' | 'fallback' | 'git' | 'traefik' | 'cloudflare';

export interface SettingsHubViewProps {
  onSettingsSaved?: () => void;
  projectId?: string | null;
  projectName?: string;
  services: Service[];
  domains: Domain[];
  onSetDefault: (serviceId: string | null) => Promise<boolean>;
  isLoadingDefaultService: boolean;
  onApplyTraefik: () => Promise<void>;
  isApplyingTraefik: boolean;
}

export const SettingsHubView: React.FC<SettingsHubViewProps> = ({
  onSettingsSaved,
  projectId,
  projectName,
  services,
  domains,
  onSetDefault,
  isLoadingDefaultService,
  onApplyTraefik,
  isApplyingTraefik,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = (searchParams.get('tab') as SettingsTab) || 'general';

  const validTabs: SettingsTab[] = ['general', 'fallback', 'git', 'traefik', 'cloudflare'];
  const activeTab: SettingsTab = validTabs.includes(currentTab) ? currentTab : 'general';

  const handleSelectTab = (tab: SettingsTab) => {
    setSearchParams({ tab });
  };

  const tabsConfig = [
    {
      id: 'general' as SettingsTab,
      label: 'Geral & Sistema',
      icon: Settings,
      description: 'Domínio principal, IP de origem e versão',
    },
    {
      id: 'fallback' as SettingsTab,
      label: 'Serviço Padrão (Fallback)',
      icon: Compass,
      description: 'Regra catch-all para domínios não mapeados',
    },
    {
      id: 'git' as SettingsTab,
      label: 'Integrações Git',
      icon: GitBranch,
      description: 'Contas GitHub, GitLab, Bitbucket e webhooks',
    },
    {
      id: 'traefik' as SettingsTab,
      label: 'Traefik & Proxy',
      icon: Route,
      description: 'Configuração dinâmica do proxy e recarga',
    },
    {
      id: 'cloudflare' as SettingsTab,
      label: 'Cloudflare & SSL',
      icon: ShieldCheck,
      description: 'Certificados Origin CA e DNS Cloudflare',
    },
  ];

  return (
    <div className="space-y-5 w-full">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold shadow-2xs">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Configurações & Ajustes
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Gerencie em um só lugar as preferências do sistema, regras de fallback, conexões Git, proxy Traefik e SSL Cloudflare.
            </p>
          </div>
        </div>

        {projectName && (
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs font-medium shrink-0">
            <span className="text-slate-400">Ambiente Ativo:</span>
            <span className="font-semibold text-slate-900">{projectName}</span>
          </div>
        )}
      </div>

      {/* 2-Column Vertical Layout */}
      <div className="flex flex-col lg:flex-row gap-5 items-start w-full">
        {/* Left Vertical Menu */}
        <div className="w-full lg:w-64 shrink-0 bg-white border border-slate-200 rounded-2xl p-2.5 shadow-2xs space-y-1 lg:sticky lg:top-4">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Módulos de Configuração
          </div>

          {tabsConfig.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTab(t.id)}
                className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-semibold leading-tight ${isActive ? 'text-white' : 'text-slate-900'}`}>
                    {t.label}
                  </div>
                  <div className={`text-[10px] truncate mt-0.5 ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                    {t.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Content Area */}
        <div className="flex-1 min-w-0 w-full">
          {activeTab === 'general' && (
            <SettingsView
              onSettingsSaved={onSettingsSaved}
              projectId={projectId}
              projectName={projectName}
            />
          )}

          {activeTab === 'fallback' && (
            <DefaultServiceView
              services={services}
              domains={domains}
              onSetDefault={onSetDefault}
              isLoading={isLoadingDefaultService}
            />
          )}

          {activeTab === 'git' && (
            <IntegrationsView
              projectId={projectId}
              projectName={projectName}
            />
          )}

          {activeTab === 'traefik' && (
            <TraefikView
              onApplyConfig={onApplyTraefik}
              isApplying={isApplyingTraefik}
              projectId={projectId}
              projectName={projectName}
            />
          )}

          {activeTab === 'cloudflare' && (
            <CloudflareView
              projectId={projectId}
              projectName={projectName}
            />
          )}
        </div>
      </div>
    </div>
  );
};
