import React, { useState, useEffect, useCallback } from 'react';
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { Server, ArrowLeft } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { NotificationProvider, useNotification } from './context/NotificationContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Sidebar, type ActiveTab } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
import { LoginView } from './components/LoginView.tsx';
import { DashboardView } from './components/views/DashboardView.tsx';
import { ServicesView } from './components/views/ServicesView.tsx';
import { DomainsView } from './components/views/DomainsView.tsx';
import { DefaultServiceView } from './components/views/DefaultServiceView.tsx';
import { ContainersView } from './components/views/ContainersView.tsx';
import { TraefikView } from './components/views/TraefikView.tsx';
import { CloudflareView } from './components/views/CloudflareView.tsx';
import { AuditLogsView } from './components/views/AuditLogsView.tsx';
import { TestSuiteView } from './components/views/TestSuiteView.tsx';
import { SettingsView } from './components/views/SettingsView.tsx';
import { SettingsHubView } from './components/views/SettingsHubView.tsx';
import { IntegrationsView } from './components/views/IntegrationsView.tsx';
import { ProjectsManagementView } from './components/views/ProjectsManagementView.tsx';
import { ProjectHostsView } from './components/views/ProjectHostsView.tsx';
import { ProjectSelector } from './components/navigation/ProjectSelector.tsx';
import { ServiceDetailView } from './components/views/ServiceDetailView.tsx';
import { CreateServiceView } from './components/views/CreateServiceView.tsx';
import { SitesView } from './components/views/SitesView.tsx';
import { DatabasesView } from './components/views/DatabasesView.tsx';
import { DatabaseStudioView } from './components/views/DatabaseStudioView.tsx';
import {
  ServiceModal,
  DomainModal,
  LogsModal,
  ConfirmModal,
  BuildLogsModal,
} from './components/Modals.tsx';
import { TemplateDeployModal } from './components/TemplateDeployModal.tsx';
import { ImportComposeModal } from './components/ImportComposeModal.tsx';
import type { DashboardStats, Service, Domain, Project, DockerHost } from './types/index.ts';

// Route wrapper for /services/:id with dynamic deep-linking
interface ServiceDetailRouteWrapperProps {
  services: Service[];
  domains: Domain[];
  onSaveServiceDetail: (id: string, updates: Partial<Service>) => Promise<boolean>;
  onDeleteService: (service: Service) => void;
  onStartContainer: (service: Service) => void;
  onStopContainer: (service: Service) => void;
  onRestartContainer: (service: Service) => void;
  onOpenLogs: (containerName: string) => void;
  onTriggerRebuild: (id: string) => void;
  loadData: () => void;
  mainDomain: string;
  isRefreshing: boolean;
}

const ServiceDetailRouteWrapper: React.FC<ServiceDetailRouteWrapperProps> = ({
  services,
  domains,
  onSaveServiceDetail,
  onDeleteService,
  onStartContainer,
  onStopContainer,
  onRestartContainer,
  onOpenLogs,
  onTriggerRebuild,
  loadData,
  mainDomain,
  isRefreshing,
}) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabFromQuery = searchParams.get('tab') as any;

  const service = services.find((s) => s.id === id);

  if (!service) {
    if (isRefreshing && services.length === 0) {
      return (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-500 font-medium">Carregando detalhes do serviço...</p>
        </div>
      );
    }
    return (
      <div className="p-12 text-center bg-white rounded-xl border border-slate-200 max-w-lg mx-auto shadow-xs">
        <Server className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800">Serviço não encontrado</h3>
        <p className="text-xs text-slate-500 mt-1 mb-6">
          O serviço com ID <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">{id}</code> não foi localizado ou foi removido.
        </p>
        <button
          onClick={() => navigate('/services')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar para Lista de Serviços</span>
        </button>
      </div>
    );
  }

  return (
    <ServiceDetailView
      service={service}
      allServices={services}
      domains={domains}
      initialTab={tabFromQuery || 'env'}
      onBack={() => navigate('/services')}
      onUpdateService={onSaveServiceDetail}
      onDeleteService={onDeleteService}
      onStartContainer={onStartContainer}
      onStopContainer={onStopContainer}
      onRestartContainer={onRestartContainer}
      onViewLogs={onOpenLogs}
      onTriggerRebuild={onTriggerRebuild}
      onRefreshData={loadData}
      mainDomain={mainDomain}
    />
  );
};

function MainApp() {
  const { user, isLoading: authLoading, authFetch } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isApplyingTraefik, setIsApplyingTraefik] = useState<boolean>(false);

  // Modals state
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const [domainModalOpen, setDomainModalOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null);

  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [logsContainerName, setLogsContainerName] = useState<string>('');

  const [buildLogsModalOpen, setBuildLogsModalOpen] = useState(false);
  const [buildLogsService, setBuildLogsService] = useState<Service | null>(null);
  const [isRebuilding, setIsRebuilding] = useState<boolean>(false);

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [importComposeModalOpen, setImportComposeModalOpen] = useState(false);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDescription, setConfirmDescription] = useState('');
  const [confirmCallback, setConfirmCallback] = useState<() => Promise<void>>(() => async () => {});

  // Multi-Host & Projects State
  const [projects, setProjects] = useState<Project[]>([]);
  const [hosts, setHosts] = useState<DockerHost[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    return localStorage.getItem('ddm_selected_project') || null;
  });

  const handleSelectProject = (id: string | null) => {
    setSelectedProjectId(id);
    if (id) {
      localStorage.setItem('ddm_selected_project', id);
    } else {
      localStorage.removeItem('ddm_selected_project');
    }
  };

  // Compute active tab from current URL pathname
  const getCurrentTab = (): ActiveTab => {
    const p = location.pathname;
    if (p === '/' || p.startsWith('/dashboard')) return 'dashboard';
    if (p.startsWith('/projects')) return 'projects';
    if (p.startsWith('/hosts')) return 'hosts';
    if (p.startsWith('/services/')) return 'service-detail';
    if (p.startsWith('/services')) return 'services';
    if (p.startsWith('/sites')) return 'sites';
    if (p.startsWith('/databases')) return 'databases';
    if (p.startsWith('/domains')) return 'domains';
    if (p.startsWith('/default-service')) return 'default-service';
    if (p.startsWith('/containers')) return 'containers';
    if (p.startsWith('/integrations')) return 'integrations';
    if (p.startsWith('/traefik')) return 'traefik';
    if (p.startsWith('/cloudflare')) return 'cloudflare';
    if (p.startsWith('/audit')) return 'audit';
    if (p.startsWith('/tests')) return 'tests';
    if (p.startsWith('/settings')) return 'settings';
    return 'dashboard';
  };

  const currentTab = getCurrentTab();

  const handleNavigateTab = (tab: ActiveTab) => {
    switch (tab) {
      case 'dashboard':
        navigate('/dashboard');
        break;
      case 'projects':
        navigate('/projects');
        break;
      case 'hosts':
        navigate('/hosts');
        break;
      case 'services':
        navigate('/services');
        break;
      case 'sites':
        navigate('/sites');
        break;
      case 'databases':
        navigate('/databases');
        break;
      case 'service-detail':
        navigate('/services');
        break;
      case 'domains':
        navigate('/domains');
        break;
      case 'default-service':
        navigate('/default-service');
        break;
      case 'containers':
        navigate('/containers');
        break;
      case 'integrations':
        navigate('/integrations');
        break;
      case 'traefik':
        navigate('/traefik');
        break;
      case 'cloudflare':
        navigate('/cloudflare');
        break;
      case 'audit':
        navigate('/audit');
        break;
      case 'tests':
        navigate('/tests');
        break;
      case 'settings':
        navigate('/settings');
        break;
      default:
        navigate('/dashboard');
    }
  };

  const loadData = useCallback(async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      const [statsRes, servicesRes, domainsRes, projectsRes, hostsRes] = await Promise.all([
        authFetch('/api/dashboard'),
        authFetch('/api/services'),
        authFetch('/api/domains'),
        authFetch('/api/projects'),
        authFetch('/api/hosts'),
      ]);

      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      if (servicesRes.ok) {
        setServices(await servicesRes.json());
      }
      if (domainsRes.ok) {
        setDomains(await domainsRes.json());
      }
      if (projectsRes.ok) {
        const projs: Project[] = await projectsRes.json();
        setProjects(projs);
        setSelectedProjectId((prev) => {
          if (prev && projs.some((p) => p.id === prev)) return prev;
          const defaultProj = projs.find((p) => p.isDefault) || projs[0];
          if (defaultProj) {
            localStorage.setItem('ddm_selected_project', defaultProj.id);
            return defaultProj.id;
          }
          return null;
        });
      }
      if (hostsRes.ok) {
        setHosts(await hostsRes.json());
      }
    } catch (err) {
      console.error('Falha ao atualizar dados:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [user, authFetch]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  // Apply Traefik dynamic config
  const handleApplyTraefik = async () => {
    setIsApplyingTraefik(true);
    try {
      const res = await authFetch('/api/traefik/apply', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showNotification(
          'success',
          'Configuração Aplicada',
          'O arquivo dynamic_conf.yml foi regenerado e sincronizado com sucesso.'
        );
        loadData();
      } else {
        showNotification('error', 'Erro ao Aplicar', data.error || 'Falha na validação do Traefik.');
      }
    } catch (err: any) {
      showNotification('error', 'Erro de Conexão', err.message);
    } finally {
      setIsApplyingTraefik(false);
    }
  };

  // Service CRUD handlers
  const handleSaveService = async (serviceData: Partial<Service>): Promise<boolean> => {
    try {
      let res;
      if (editingService) {
        res = await authFetch(`/api/services/${editingService.id}`, {
          method: 'PUT',
          body: JSON.stringify(serviceData),
        });
      } else {
        res = await authFetch('/api/services', {
          method: 'POST',
          body: JSON.stringify(serviceData),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        showNotification('error', 'Erro ao Salvar', data.error || 'Falha ao salvar serviço.');
        return false;
      }

      showNotification(
        'success',
        editingService ? 'Serviço Atualizado' : 'Serviço Criado',
        `O serviço "${serviceData.name}" foi salvo com sucesso.`
      );
      loadData();
      return true;
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
      return false;
    }
  };

  const handleSaveServiceDetail = async (id: string, updates: Partial<Service>): Promise<boolean> => {
    try {
      const res = await authFetch(`/api/services/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });

      const data = await res.json();
      if (!res.ok) {
        showNotification('error', 'Erro ao Salvar', data.error || 'Falha ao salvar alterações.');
        return false;
      }

      showNotification('success', 'Configurações Salvas', 'Serviço, ambiente e roteamento atualizados com sucesso.');
      loadData();
      return true;
    } catch (err: any) {
      showNotification('error', 'Erro de Conexão', err.message);
      return false;
    }
  };

  const handleDeleteService = (service: Service) => {
    setConfirmTitle(`Excluir Serviço: ${service.name}?`);
    setConfirmDescription(
      `Tem certeza que deseja remover o serviço "${service.name}" (${service.containerName})? Todos os domínios vinculados perderão o roteamento e o Traefik será reconfigurado.`
    );
    setConfirmCallback(() => async () => {
      try {
        const res = await authFetch(`/api/services/${service.id}`, { method: 'DELETE' });
        if (res.ok) {
          showNotification('success', 'Serviço Removido', `O serviço "${service.name}" foi excluído.`);
          navigate('/services');
          loadData();
        } else {
          const data = await res.json();
          showNotification('error', 'Erro ao Excluir', data.error);
        }
      } catch (err: any) {
        showNotification('error', 'Erro', err.message);
      }
    });
    setConfirmModalOpen(true);
  };

  const handleToggleServiceActive = async (service: Service) => {
    try {
      const res = await authFetch(`/api/services/${service.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !service.isActive }),
      });
      if (res.ok) {
        showNotification(
          'info',
          service.isActive ? 'Serviço Desativado' : 'Serviço Ativado',
          `Roteamento para "${service.name}" foi ${service.isActive ? 'interrompido' : 'habilitado'}.`
        );
        loadData();
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    }
  };

  const handleStartContainer = async (service: Service) => {
    try {
      const res = await authFetch(`/api/services/${service.id}/start`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showNotification('success', 'Serviço Iniciado', `Serviço "${service.name}" iniciado com sucesso.`);
        await loadData();
      } else {
        showNotification('error', 'Falha ao Iniciar Serviço', data.error || 'Não foi possível iniciar o serviço.');
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    }
  };

  const handleStopContainer = async (service: Service) => {
    try {
      const res = await authFetch(`/api/services/${service.id}/stop`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showNotification('info', 'Serviço Parado', `Serviço "${service.name}" interrompido com sucesso.`);
        await loadData();
      } else {
        showNotification('error', 'Falha ao Parar Serviço', data.error || 'Não foi possível parar o serviço.');
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    }
  };

  const handleRestartContainer = async (service: Service) => {
    try {
      const res = await authFetch(`/api/services/${service.id}/restart`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showNotification('success', 'Serviço Reiniciado', `Serviço "${service.name}" reiniciado com sucesso.`);
        await loadData();
      } else {
        showNotification('error', 'Falha ao Reiniciar Serviço', data.error || 'Não foi possível reiniciar o serviço.');
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    }
  };

  // Domain Handlers
  const handleSaveDomain = async (domainData: {
    domainName: string;
    serviceId: string;
    isActive?: boolean;
    targetContainer?: string;
    targetPort?: number;
  }): Promise<boolean> => {
    try {
      let res;
      if (editingDomain) {
        res = await authFetch(`/api/domains/${editingDomain.id}`, {
          method: 'PUT',
          body: JSON.stringify(domainData),
        });
      } else {
        res = await authFetch('/api/domains', {
          method: 'POST',
          body: JSON.stringify(domainData),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        showNotification('error', 'Erro ao Salvar Domínio', data.error || 'Falha ao salvar domínio.');
        return false;
      }

      showNotification(
        'success',
        editingDomain ? 'Domínio Atualizado' : 'Domínio Cadastrado',
        `O domínio "${domainData.domainName}" foi configurado no Traefik.`
      );
      loadData();
      return true;
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
      return false;
    }
  };

  const handleDeleteDomain = (domain: Domain) => {
    setConfirmTitle(`Excluir Domínio: ${domain.domainName}?`);
    setConfirmDescription(
      `O domínio "${domain.domainName}" deixará de responder imediatamente no Traefik. Deseja prosseguir?`
    );
    setConfirmCallback(() => async () => {
      try {
        const res = await authFetch(`/api/domains/${domain.id}`, { method: 'DELETE' });
        if (res.ok) {
          showNotification('success', 'Domínio Removido', `O domínio "${domain.domainName}" foi desvinculado.`);
          loadData();
        }
      } catch (err: any) {
        showNotification('error', 'Erro', err.message);
      }
    });
    setConfirmModalOpen(true);
  };

  const handleToggleDomainActive = async (domain: Domain) => {
    try {
      const res = await authFetch(`/api/domains/${domain.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !domain.isActive }),
      });
      if (res.ok) {
        showNotification(
          'info',
          domain.isActive ? 'Domínio Desativado' : 'Domínio Ativado',
          `Roteamento para "${domain.domainName}" foi ${domain.isActive ? 'interrompido' : 'ativado'}.`
        );
        loadData();
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    }
  };

  const handleSetDefaultService = async (serviceId: string | null): Promise<boolean> => {
    try {
      const res = await authFetch('/api/services/default', {
        method: 'POST',
        body: JSON.stringify({ serviceId }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(
          'success',
          'Serviço Padrão Configurado',
          serviceId
            ? `O container "${data.service?.name}" foi definido como fallback catch-all.`
            : 'O fallback catch-all foi desativado.'
        );
        loadData();
        return true;
      } else {
        showNotification('error', 'Falha', data.error);
        return false;
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
      return false;
    }
  };

  // Open Log Modal
  const handleOpenLogs = (containerName: string) => {
    setLogsContainerName(containerName);
    setLogsModalOpen(true);
  };

  // Build Logs Modal
  const handleOpenBuildLogs = (service: Service) => {
    setBuildLogsService(service);
    setBuildLogsModalOpen(true);
  };

  const handleTriggerRebuild = async (serviceId: string) => {
    setIsRebuilding(true);
    try {
      const res = await authFetch(`/api/services/${serviceId}/rebuild`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showNotification('info', 'Build Iniciado', `Rebuild do serviço disparado a partir do repositório Git.`);
        loadData();
      } else {
        showNotification('error', 'Falha ao Disparar Build', data.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setIsRebuilding(false);
    }
  };

  // Template Deploy
  const handleDeployTemplate = async (deployData: {
    templateId: string;
    serviceName: string;
    containerName: string;
    values: Record<string, string>;
    domainName?: string;
  }): Promise<boolean> => {
    try {
      const res = await authFetch('/api/templates/deploy', {
        method: 'POST',
        body: JSON.stringify({
          ...deployData,
          projectId: selectedProjectId || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(
          'success',
          'Aplicação Implantada com Sucesso!',
          `O serviço "${data.service?.name}" foi criado e roteado para o domínio ${deployData.domainName || 'padrão'}.`
        );
        loadData();
        return true;
      } else {
        showNotification('error', 'Falha no Deploy do Template', data.error);
        return false;
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
      return false;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Carregando StackOrbit...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginView />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  const isDefaultProject = selectedProject?.isDefault ?? true;

  const displayedServices = selectedProjectId
    ? services.filter((s) => s.projectId === selectedProjectId || (isDefaultProject && !s.projectId))
    : services;

  const displayedServiceIds = new Set(displayedServices.map((s) => s.id));
  const displayedDomains = selectedProjectId
    ? domains.filter((d) => displayedServiceIds.has(d.serviceId))
    : domains;

  const displayedSites = displayedServices.filter((s) => {
    const meta = (s as any).meta || {};
    const notes = (s.notes || '').toLowerCase();
    return meta.isSite || notes.includes('site estático') || notes.includes('site php') || notes.includes('wordpress') || notes.includes('prestashop');
  });

  const displayedDatabases = displayedServices.filter((s) => {
    const img = (s.image || '').toLowerCase();
    const notes = (s.notes || '').toLowerCase();
    return (
      img.includes('postgres') ||
      img.includes('mariadb') ||
      img.includes('mysql') ||
      img.includes('redis') ||
      notes.includes('postgresql') ||
      notes.includes('mariadb') ||
      notes.includes('redis')
    );
  });

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={handleNavigateTab}
        servicesCount={displayedServices.length}
        domainsCount={displayedDomains.length}
        sitesCount={displayedSites.length}
        databasesCount={displayedDatabases.length}
        dockerConnected={stats?.dockerConnected ?? true}
        projects={projects}
        hosts={hosts}
        selectedProjectId={selectedProjectId}
        onSelectProject={handleSelectProject}
      />

      {/* Main Viewport */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header
          currentTab={currentTab}
          onRefresh={loadData}
          isRefreshing={isRefreshing}
          onApplyTraefik={handleApplyTraefik}
          isApplyingTraefik={isApplyingTraefik}
        />

        {/* View Content Area with Declarative Routing */}
        <main className={`flex-1 overflow-y-auto ${location.pathname.startsWith('/services/') || location.pathname.startsWith('/settings') || location.pathname.startsWith('/databases/') ? 'p-4 md:p-6' : 'p-6'}`}>
          <div className={location.pathname.startsWith('/services/') || location.pathname.startsWith('/settings') || location.pathname.startsWith('/databases/') ? 'w-full' : 'max-w-7xl mx-auto'}>
            <ErrorBoundary>
              <Routes>
                {/* Home & Login Redirects */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/login" element={<Navigate to="/dashboard" replace />} />

              {/* Multi-Project & Hosts Management */}
              <Route
                path="/projects"
                element={
                  <ProjectsManagementView
                    projects={projects}
                    hosts={hosts}
                    selectedProjectId={selectedProjectId}
                    onSelectProject={handleSelectProject}
                    onNavigateToHosts={(projId) => {
                      handleSelectProject(projId);
                      navigate('/hosts');
                    }}
                    onRefreshData={loadData}
                    showNotification={showNotification}
                  />
                }
              />
              <Route
                path="/hosts"
                element={
                  <ProjectHostsView
                    projects={projects}
                    hosts={hosts}
                    selectedProjectId={selectedProjectId}
                    onRefreshData={loadData}
                    showNotification={showNotification}
                  />
                }
              />

              {/* 1. Dashboard */}
              <Route
                path="/dashboard"
                element={
                  <DashboardView
                    stats={stats}
                    services={displayedServices}
                    domains={domains}
                    onNavigate={handleNavigateTab}
                    onOpenNewService={() => {
                      navigate('/services/new');
                    }}
                    onOpenTemplateModal={() => setTemplateModalOpen(true)}
                    onOpenNewDomain={() => {
                      setEditingDomain(null);
                      setDomainModalOpen(true);
                    }}
                  />
                }
              />

              {/* 2. Services List */}
              <Route
                path="/services"
                element={
                  <ServicesView
                    services={displayedServices}
                    onOpenCreate={() => {
                      navigate('/services/new');
                    }}
                    onOpenImportCompose={() => setImportComposeModalOpen(true)}
                    onOpenTemplateModal={() => setTemplateModalOpen(true)}
                    onGoToContainers={() => navigate('/containers')}
                    onOpenEdit={(svc) => {
                      navigate(`/services/${svc.id}?tab=containers`);
                    }}
                    onOpenTerminal={(svc) => {
                      navigate(`/services/${svc.id}?tab=terminal`);
                    }}
                    onDelete={handleDeleteService}
                    onToggleActive={handleToggleServiceActive}
                    onStartContainer={handleStartContainer}
                    onStopContainer={handleStopContainer}
                    onRestartContainer={handleRestartContainer}
                    onViewLogs={(svc) => handleOpenLogs(svc.containerName)}
                    onViewBuildLogs={handleOpenBuildLogs}
                    onTriggerRebuild={(svc) => handleTriggerRebuild(svc.id)}
                    isLoading={isRefreshing}
                    onRefresh={loadData}
                  />
                }
              />

              {/* 2b. New Service Page */}
              <Route
                path="/services/new"
                element={
                  <CreateServiceView
                    onSave={async (serviceData) => {
                      try {
                        const res = await authFetch('/api/services', {
                          method: 'POST',
                          body: JSON.stringify(serviceData),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          showNotification('error', 'Erro ao Criar Serviço', data.error || 'Falha ao salvar serviço.');
                          return false;
                        }
                        showNotification('success', 'Serviço Criado', `O serviço "${serviceData.name}" foi cadastrado com sucesso.`);
                        loadData();
                        return data;
                      } catch (err: any) {
                        showNotification('error', 'Erro', err.message);
                        return false;
                      }
                    }}
                  />
                }
              />

              {/* 3. Service Detail (with URL deep-linking by ID and ?tab=...) */}
              <Route
                path="/services/:id"
                element={
                  <ServiceDetailRouteWrapper
                    services={services}
                    domains={domains}
                    onSaveServiceDetail={handleSaveServiceDetail}
                    onDeleteService={handleDeleteService}
                    onStartContainer={handleStartContainer}
                    onStopContainer={handleStopContainer}
                    onRestartContainer={handleRestartContainer}
                    onOpenLogs={handleOpenLogs}
                    onTriggerRebuild={handleTriggerRebuild}
                    loadData={loadData}
                    mainDomain={stats?.mainDomain || 'bla.com.br'}
                    isRefreshing={isRefreshing}
                  />
                }
              />

              {/* 3b. Sites Web & CMS */}
              <Route
                path="/sites"
                element={
                  <SitesView
                    selectedProjectId={selectedProjectId}
                    projects={projects}
                    mainDomain={stats?.mainDomain || 'bla.com.br'}
                  />
                }
              />

              {/* 3c. Bancos de Dados Hub & Studio */}
              <Route
                path="/databases"
                element={
                  <DatabasesView
                    selectedProjectId={selectedProjectId}
                    projects={projects}
                    mainDomain={stats?.mainDomain || 'bla.com.br'}
                  />
                }
              />
              <Route
                path="/databases/:id"
                element={<DatabaseStudioView />}
              />

              {/* 4. Domains & Routing */}
              <Route
                path="/domains"
                element={
                  <DomainsView
                    domains={displayedDomains}
                    services={displayedServices}
                    mainDomain={stats?.mainDomain || 'bla.com.br'}
                    onOpenCreate={() => {
                      setEditingDomain(null);
                      setDomainModalOpen(true);
                    }}
                    onOpenEdit={(d) => {
                      setEditingDomain(d);
                      setDomainModalOpen(true);
                    }}
                    onDelete={handleDeleteDomain}
                    onToggleActive={handleToggleDomainActive}
                    isLoading={isRefreshing}
                  />
                }
              />

              {/* 5. Central Unificada de Configurações (com Abas: Geral, Fallback, Git, Traefik, Cloudflare) */}
              <Route
                path="/settings"
                element={
                  <SettingsHubView
                    onSettingsSaved={loadData}
                    projectId={selectedProjectId}
                    projectName={selectedProject?.name}
                    services={services}
                    domains={domains}
                    onSetDefault={handleSetDefaultService}
                    isLoadingDefaultService={isRefreshing}
                    onApplyTraefik={handleApplyTraefik}
                    isApplyingTraefik={isApplyingTraefik}
                  />
                }
              />

              {/* Redirecionamentos transparentes das rotas antigas para as abas correspondentes em /settings */}
              <Route path="/default-service" element={<Navigate to="/settings?tab=fallback" replace />} />
              <Route path="/integrations" element={<Navigate to="/settings?tab=git" replace />} />
              <Route path="/traefik" element={<Navigate to="/settings?tab=traefik" replace />} />
              <Route path="/cloudflare" element={<Navigate to="/settings?tab=cloudflare" replace />} />

              {/* 6. Docker Containers */}
              <Route
                path="/containers"
                element={
                  <ContainersView
                    existingServices={services}
                    projectId={selectedProjectId}
                    projectName={selectedProject?.name}
                    onOpenImportCompose={() => setImportComposeModalOpen(true)}
                    onImportContainer={(container) => {
                      const port =
                        container.ports && container.ports[0]?.privatePort
                          ? container.ports[0].privatePort
                          : 80;
                      const cleanName = container.name.replace(/^[\/_]/, '');
                      const projectHost = hosts.find((h) => h.projectId === selectedProjectId);
                      navigate(`/services/new?prefill=${encodeURIComponent(JSON.stringify({
                        name: cleanName.replace(/[-_]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
                        containerName: cleanName,
                        image: container.image,
                        internalPort: port,
                        sourceType: 'IMAGE',
                        projectId: selectedProjectId,
                        dockerHostId: projectHost?.id,
                      }))}`);
                    }}
                    onViewLogs={handleOpenLogs}
                    onRestart={(name) => {
                      const s = services.find((item) => item.containerName === name);
                      if (s) handleRestartContainer(s);
                    }}
                    onOpenTerminal={(containerName) => {
                      const s = services.find((item) => item.containerName === containerName);
                      if (s) {
                        navigate(`/services/${s.id}?tab=terminal`);
                      }
                    }}
                    onRefresh={loadData}
                  />
                }
              />

              {/* 7. Audit Logs */}
              <Route path="/audit" element={<AuditLogsView />} />

              {/* 8. Test Suite */}
              <Route path="/tests" element={<TestSuiteView />} />

              {/* Catch-all fallback route */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </main>
      </div>

      {/* Global Modals */}
      <TemplateDeployModal
        isOpen={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onDeploy={handleDeployTemplate}
        mainDomain={stats?.mainDomain || 'bla.com.br'}
      />

      <ServiceModal
        isOpen={serviceModalOpen}
        onClose={() => setServiceModalOpen(false)}
        onSave={handleSaveService}
        service={editingService}
      />

      <DomainModal
        isOpen={domainModalOpen}
        onClose={() => setDomainModalOpen(false)}
        onSave={handleSaveDomain}
        services={services}
        domain={editingDomain}
      />

      <LogsModal
        isOpen={logsModalOpen}
        onClose={() => setLogsModalOpen(false)}
        containerName={logsContainerName}
      />

      <BuildLogsModal
        isOpen={buildLogsModalOpen}
        onClose={() => setBuildLogsModalOpen(false)}
        service={buildLogsService}
        onTriggerRebuild={handleTriggerRebuild}
        isRebuilding={isRebuilding}
      />

      <ConfirmModal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={confirmCallback}
        title={confirmTitle}
        description={confirmDescription}
      />

      <ImportComposeModal
        isOpen={importComposeModalOpen}
        onClose={() => setImportComposeModalOpen(false)}
        projectId={selectedProjectId}
        dockerHostId={hosts.find((h) => h.projectId === selectedProjectId)?.id}
        onImportSuccess={(newSvc) => {
          loadData();
          navigate(`/services/${newSvc.id}?tab=containers`);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </NotificationProvider>
  );
}
