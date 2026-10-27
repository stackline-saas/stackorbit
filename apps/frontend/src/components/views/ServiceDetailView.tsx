import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Play,
  Square,
  RotateCw,
  FileText,
  Trash2,
  Globe,
  Server,
  Layers,
  Settings,
  GitBranch,
  Terminal,
  Eye,
  EyeOff,
  Plus,
  Copy,
  Check,
  Download,
  Upload,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Database,
  Cpu,
  HardDrive,
  RefreshCw,
  Sparkles,
  Key,
  Lock,
  Send,
  CornerDownLeft,
  Eraser,
  CheckCircle2,
  TerminalSquare,
  Info,
  ShieldAlert,
  Monitor,
  Boxes,
  Link2,
  Unlink,
  Network,
  X,
  Scale,
  HeartPulse,
  ChevronDown,
  ChevronRight,
  Minus,
  Clock,
  GitCommit,
  Pencil,
  SlidersHorizontal,
  Box,
} from 'lucide-react';
import type { Service, Domain, DockerContainerInfo } from '../../types/index.ts';
import { useNotification } from '../../context/NotificationContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';

interface ServiceDetailViewProps {
  service: Service;
  allServices: Service[];
  domains: Domain[];
  onBack: () => void;
  onUpdateService: (id: string, updates: Partial<Service>) => Promise<boolean>;
  onDeleteService: (service: Service) => void;
  onStartContainer: (service: Service) => void;
  onStopContainer: (service: Service) => void;
  onRestartContainer: (service: Service) => void;
  onViewLogs: (containerName: string) => void;
  onTriggerRebuild?: (serviceId: string) => void;
  onRefreshData?: () => void;
  mainDomain?: string;
  initialTab?: TabType;
}

type TabType = 'containers' | 'env' | 'general' | 'build' | 'docker' | 'domains' | 'terminal' | 'connection' | 'logs';

interface EnvRow {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  showSecret: boolean;
}

export const ServiceDetailView: React.FC<ServiceDetailViewProps> = ({
  service,
  allServices,
  domains,
  onBack,
  onUpdateService,
  onDeleteService,
  onStartContainer,
  onStopContainer,
  onRestartContainer,
  onTriggerRebuild,
  onRefreshData,
  mainDomain = 'bla.com.br',
  initialTab = 'containers',
}) => {
  const { showNotification } = useNotification();
  const { authFetch } = useAuth();

  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const validTabs: TabType[] = ['containers', 'env', 'general', 'build', 'docker', 'domains', 'terminal', 'connection', 'logs'];

  const resolvedInitialTab = (tabFromUrl && validTabs.includes(tabFromUrl)) ? tabFromUrl : initialTab;
  const [activeTab, setActiveTabState] = useState<TabType>(resolvedInitialTab);

  useEffect(() => {
    if (tabFromUrl && validTabs.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTabState(tabFromUrl);
    }
  }, [tabFromUrl]);

  const setActiveTab = (newTab: TabType) => {
    setActiveTabState(newTab);
    setSearchParams({ tab: newTab }, { replace: true });
  };

  const [isSaving, setIsSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form State initialized from Service
  const [name, setName] = useState(service.name);
  const [containerName, setContainerName] = useState(service.containerName);
  const [internalPort, setInternalPort] = useState(service.internalPort);
  const [image, setImage] = useState(service.image || '');
  const [notes, setNotes] = useState((service.notes || '').replace(/<!--dm-meta:[\s\S]*?-->/g, '').trim());
  const [isActive, setIsActive] = useState(service.isActive);
  const [isDefault, setIsDefault] = useState(service.isDefault);

  // Git / CI-CD
  const [sourceType, setSourceType] = useState<'IMAGE' | 'GITHUB'>(service.sourceType || 'IMAGE');
  const [gitRepoUrl, setGitRepoUrl] = useState(service.gitRepoUrl || '');
  const [gitBranch, setGitBranch] = useState(service.gitBranch || 'main');
  const [dockerfilePath, setDockerfilePath] = useState(service.dockerfilePath || 'Dockerfile');
  const [buildContext, setBuildContext] = useState(service.meta?.buildContext || '.');
  const [buildsHistory, setBuildsHistory] = useState<any[]>([]);
  const [isLoadingBuilds, setIsLoadingBuilds] = useState(false);
  const [isTriggeringRebuild, setIsTriggeringRebuild] = useState(false);
  const [liveBuildLogs, setLiveBuildLogs] = useState(service.buildLogs || '');
  const [liveBuildStatus, setLiveBuildStatus] = useState<string | undefined>(service.buildStatus);
  const [selectedBuildForLogs, setSelectedBuildForLogs] = useState<any | null>(null);

  useEffect(() => {
    setLiveBuildStatus(service.buildStatus);
  }, [service.buildStatus]);

  // Docker Advanced
  const [restartPolicy, setRestartPolicy] = useState(service.restartPolicy || 'unless-stopped');
  const [memoryLimitMb, setMemoryLimitMb] = useState<number | ''>(service.memoryLimitMb || '');
  const [cpuLimit, setCpuLimit] = useState<number | ''>(service.cpuLimit || '');
  const [command, setCommand] = useState(service.command || '');
  const [volumes, setVolumes] = useState(service.volumes || '');
  const [network, setNetwork] = useState(service.network || 'proxy-net');

  // Env Vars state: both Raw text and structured Rows
  const [rawEnv, setRawEnv] = useState(service.envVars || '');
  const [envViewMode, setEnvViewMode] = useState<'visual' | 'raw'>('visual');
  const [envFilter, setEnvFilter] = useState('');

  // Domain linking state
  const [newDomainInput, setNewDomainInput] = useState('');
  const [selectedDomainContainer, setSelectedDomainContainer] = useState(service.containerName);
  const [selectedDomainPort, setSelectedDomainPort] = useState<number | ''>(service.internalPort);
  const [isLinkingDomain, setIsLinkingDomain] = useState(false);

  // Load Balancing state for domain creation
  const [domainRoutingMode, setDomainRoutingMode] = useState<'single' | 'load_balancer'>('single');
  const [lbSelectedContainers, setLbSelectedContainers] = useState<string[]>([]);
  const [lbHealthCheckPath, setLbHealthCheckPath] = useState('/');

  // Selected Container for Logs and Terminal
  const [targetContainerFocus, setTargetContainerFocus] = useState<string>(service.containerName);

  // Container Grouping & Scaling State
  const [containerViewMode, setContainerViewMode] = useState<'hierarchy' | 'flat'>('hierarchy');
  const [collapsedComponents, setCollapsedComponents] = useState<Record<string, boolean>>({});
  const [desiredScale, setDesiredScale] = useState<Record<string, number>>({});
  const [scalingComponent, setScalingComponent] = useState<string | null>(null);

  // Logs state
  const [logsContent, setLogsContent] = useState<string>('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);

  // Terminal & SSH state
  const [terminalHistory, setTerminalHistory] = useState<
    Array<{
      id: string;
      command: string;
      output: string;
      exitCode: number;
      time: string;
      shell: string;
    }>
  >([]);
  const [currentCommand, setCurrentCommand] = useState('');
  const [commandHistoryList, setCommandHistoryList] = useState<string[]>([
    'ls -la',
    'env',
    'ps aux',
    'df -h',
    'netstat -tuln',
    'cat .env',
  ]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecutingCommand, setIsExecutingCommand] = useState(false);
  const [selectedShell, setSelectedShell] = useState<'/bin/sh' | '/bin/bash'>('/bin/sh');
  const [sshHostInput, setSshHostInput] = useState(mainDomain || 'servidor.bla.com.br');
  const [sshUserInput, setSshUserInput] = useState('root');
  const [sshPortInput, setSshPortInput] = useState('22');
  const [sshInfo, setSshInfo] = useState<any>(null);
  const [isLoadingSshInfo, setIsLoadingSshInfo] = useState(false);
  const terminalBottomRef = React.useRef<HTMLDivElement>(null);
  const terminalInputRef = React.useRef<HTMLInputElement>(null);

  // Stack Containers State
  const [containersList, setContainersList] = useState<DockerContainerInfo[]>([]);
  const [availableContainers, setAvailableContainers] = useState<any[]>([]);
  const [composeProject, setComposeProject] = useState<string | null>(null);
  const [isLoadingContainers, setIsLoadingContainers] = useState(false);
  const [selectedContainerToLink, setSelectedContainerToLink] = useState('');
  const [isLinkingContainer, setIsLinkingContainer] = useState(false);
  const [containerActionLoading, setContainerActionLoading] = useState<Record<string, boolean>>({});

  const fetchContainers = async () => {
    setIsLoadingContainers(true);
    try {
      const res = await authFetch(`/api/services/${service.id}/containers`);
      if (res.ok) {
        const data = await res.json();
        setContainersList(data.containers || []);
        setComposeProject(data.composeProject || null);
        setAvailableContainers(data.allAvailableContainers || []);
        setPublishedPorts(data.publishedPorts || {});
      }
    } catch (err: any) {
      console.warn('Falha ao carregar containers do serviço:', err);
    } finally {
      setIsLoadingContainers(false);
    }
  };

  useEffect(() => {
    fetchContainers();
  }, [service.id]);

  const handleLinkContainer = async () => {
    if (!selectedContainerToLink) return;
    setIsLinkingContainer(true);
    try {
      const res = await authFetch(`/api/services/${service.id}/containers/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ containerName: selectedContainerToLink }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(
          'success',
          'Container Vinculado',
          `Container ${selectedContainerToLink} associado ao serviço e conectado ao proxy-net.`
        );
        setSelectedContainerToLink('');
        await fetchContainers();
        if (onRefreshData) onRefreshData();
      } else {
        showNotification('error', 'Falha ao vincular', data.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setIsLinkingContainer(false);
    }
  };

  const handleUnlinkContainer = async (cName: string) => {
    try {
      const res = await authFetch(`/api/services/${service.id}/containers/unlink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ containerName: cName }),
      });
      if (res.ok) {
        showNotification('success', 'Container Desvinculado', `Container ${cName} desvinculado da stack.`);
        await fetchContainers();
        if (onRefreshData) onRefreshData();
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    }
  };

  const handleAttachNetwork = async (cName: string) => {
    setContainerActionLoading((prev) => ({ ...prev, [cName]: true }));
    try {
      const res = await authFetch(`/api/services/${service.id}/containers/attach-network`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ containerName: cName }),
      });
      if (res.ok) {
        showNotification('success', 'Rede Conectada', `Container ${cName} conectado à rede proxy-net.`);
        await fetchContainers();
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setContainerActionLoading((prev) => ({ ...prev, [cName]: false }));
    }
  };

  const handleSetPrimary = async (cName: string, port?: number) => {
    try {
      const res = await authFetch(`/api/services/${service.id}/set-primary-container`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ containerName: cName, internalPort: port || internalPort }),
      });
      if (res.ok) {
        setContainerName(cName);
        if (port) setInternalPort(port);
        showNotification(
          'success',
          'Roteador HTTP Atualizado',
          `Container ${cName} agora é o receptor de tráfego HTTP do Traefik.`
        );
        await fetchContainers();
        if (onRefreshData) onRefreshData();
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    }
  };

  const handleContainerPower = async (cName: string, action: 'start' | 'stop' | 'restart') => {
    setContainerActionLoading((prev) => ({ ...prev, [cName]: true }));
    try {
      const endpoint = `/api/containers/${encodeURIComponent(cName)}/${action}`;
      const res = await authFetch(endpoint, { method: 'POST' });
      if (res.ok) {
        showNotification(
          'success',
          'Sucesso',
          `Container "${cName}" ${action === 'start' ? 'iniciado' : action === 'stop' ? 'parado' : 'reiniciado'}.`
        );
        await fetchContainers();
        if (onRefreshData) onRefreshData();
      } else {
        const data = await res.json();
        showNotification('error', 'Erro', data.error || `Falha ao executar ${action}`);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setContainerActionLoading((prev) => ({ ...prev, [cName]: false }));
    }
  };

  // Quick Domain Modal for specific container
  const [quickDomainModalOpen, setQuickDomainModalOpen] = useState(false);
  const [quickDomainTargetContainer, setQuickDomainTargetContainer] = useState('');
  const [quickDomainTargetPort, setQuickDomainTargetPort] = useState<number>(80);
  const [quickDomainInput, setQuickDomainInput] = useState('');
  const [isSavingQuickDomain, setIsSavingQuickDomain] = useState(false);

  const handleOpenQuickDomainModal = (c: DockerContainerInfo) => {
    const p = (c as any).detectedPort || c.ports?.find((port) => port.privatePort)?.privatePort || (c.name === containerName ? internalPort : 80);
    setQuickDomainTargetContainer(c.name);
    setQuickDomainTargetPort(p);
    setQuickDomainInput('');
    setQuickDomainModalOpen(true);
  };

  const handleSaveQuickDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickDomainInput.trim()) return;
    setIsSavingQuickDomain(true);
    try {
      const res = await authFetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domainName: quickDomainInput.trim(),
          serviceId: service.id,
          targetContainer: quickDomainTargetContainer,
          targetPort: quickDomainTargetPort,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(
          'success',
          'Domínio Vinculado',
          `Domínio ${quickDomainInput.trim()} apontado para ${quickDomainTargetContainer}:${quickDomainTargetPort}.`
        );
        setQuickDomainModalOpen(false);
        setQuickDomainInput('');
        if (onRefreshData) onRefreshData();
      } else {
        showNotification('error', 'Falha ao vincular domínio', data.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setIsSavingQuickDomain(false);
    }
  };

  // Container Modal States (Dedicated Logs & Terminal Modals)
  const [modalLogsContainer, setModalLogsContainer] = useState<string | null>(null);
  const [modalLogsTail, setModalLogsTail] = useState<number>(200);
  const [modalLogsAutoRefresh, setModalLogsAutoRefresh] = useState(true);
  const [modalLogsContent, setModalLogsContent] = useState<string>('');
  const [modalLogsLoading, setModalLogsLoading] = useState(false);
  const [modalLogsFilter, setModalLogsFilter] = useState('');

  const [modalTerminalContainer, setModalTerminalContainer] = useState<string | null>(null);
  const [modalTerminalShell, setModalTerminalShell] = useState<string>('/bin/sh');
  const [modalTerminalHistory, setModalTerminalHistory] = useState<
    Array<{
      id: string;
      command: string;
      output: string;
      exitCode: number;
      time: string;
    }>
  >([]);
  const [modalTerminalCmd, setModalTerminalCmd] = useState('');
  const [modalTerminalExecuting, setModalTerminalExecuting] = useState(false);
  const [modalTerminalCmdHistory, setModalTerminalCmdHistory] = useState<string[]>([]);
  const [modalTerminalHistoryIndex, setModalTerminalHistoryIndex] = useState(-1);
  const modalTerminalBottomRef = React.useRef<HTMLDivElement>(null);
  const modalTerminalInputRef = React.useRef<HTMLInputElement>(null);

  // States: Modal Adicionar Nova Instância
  const [addInstanceModalOpen, setAddInstanceModalOpen] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [newInstanceImage, setNewInstanceImage] = useState('');
  const [newInstancePort, setNewInstancePort] = useState('');
  const [newInstanceEnvs, setNewInstanceEnvs] = useState('');
  const [newInstanceVolumes, setNewInstanceVolumes] = useState('');
  const [newInstanceCommand, setNewInstanceCommand] = useState('');
  const [isSubmittingNewInstance, setIsSubmittingNewInstance] = useState(false);

  // States: Modal Templates Prontos na Stack
  const [stackTemplateModalOpen, setStackTemplateModalOpen] = useState(false);
  const [stackTemplatesList, setStackTemplatesList] = useState<any[]>([]);
  const [selectedStackTemplate, setSelectedStackTemplate] = useState<any | null>(null);
  const [stackTemplateCategory, setStackTemplateCategory] = useState<string>('all');
  const [stackTemplateContainerName, setStackTemplateContainerName] = useState('');
  const [stackTemplateFieldValues, setStackTemplateFieldValues] = useState<Record<string, string>>({});
  const [isSubmittingStackTemplate, setIsSubmittingStackTemplate] = useState(false);

  useEffect(() => {
    fetch('/api/templates', {
      headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setStackTemplatesList(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedStackTemplate) {
      setStackTemplateContainerName(`${service.containerName}-${selectedStackTemplate.id}`);
      const initial: Record<string, string> = {};
      selectedStackTemplate.fields?.forEach((f: any) => {
        initial[f.key] = f.defaultValue || '';
      });
      setStackTemplateFieldValues(initial);
    }
  }, [selectedStackTemplate, service.containerName]);

  // States: Modal Publicar Porta Host da Instância
  const [portModalOpen, setPortModalOpen] = useState(false);
  const [portModalComponent, setPortModalComponent] = useState('');
  const [portModalContainerPort, setPortModalContainerPort] = useState('');
  const [portModalHostPort, setPortModalHostPort] = useState('');
  const [isSavingPortModal, setIsSavingPortModal] = useState(false);
  const [publishedPorts, setPublishedPorts] = useState<Record<string, { hostPort: number; containerPort: number; protocol?: string }>>({});
  const [quickDomainComponentName, setQuickDomainComponentName] = useState<string>('');
  const [newInstanceHostPort, setNewInstanceHostPort] = useState('');
  const [stackTemplateHostPort, setStackTemplateHostPort] = useState('');

  const handleOpenPortModal = (compName: string, defaultContainerPort: number, currentHostPort?: number) => {
    setPortModalComponent(compName);
    setPortModalContainerPort(String(defaultContainerPort || 80));
    setPortModalHostPort(currentHostPort ? String(currentHostPort) : '');
    setPortModalOpen(true);
  };

  const handleSavePortModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portModalComponent) return;
    setIsSavingPortModal(true);
    try {
      const res = await authFetch(`/api/services/${service.id}/instances/${encodeURIComponent(portModalComponent)}/ports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          containerPort: Number(portModalContainerPort),
          hostPort: portModalHostPort.trim() ? Number(portModalHostPort) : null,
          protocol: 'tcp',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(
          'success',
          'Porta Configurada',
          portModalHostPort.trim()
            ? `Porta host ${portModalHostPort} vinculada a :${portModalContainerPort} da instância "${portModalComponent}".`
            : `Porta pública removida da instância "${portModalComponent}".`
        );
        setPortModalOpen(false);
        await fetchContainers();
        if (onRefreshData) onRefreshData();
      } else {
        showNotification('error', 'Falha ao configurar porta', data.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setIsSavingPortModal(false);
    }
  };

  const handleOpenQuickDomainModalForComponent = (
    compName: string,
    defaultPort: number,
    replicas: DockerContainerInfo[]
  ) => {
    setQuickDomainComponentName(compName);
    const target =
      replicas.length > 1
        ? JSON.stringify(replicas.map((r) => ({ container: r.name, port: defaultPort })))
        : replicas[0]?.name || compName;
    setQuickDomainTargetContainer(target);
    setQuickDomainTargetPort(defaultPort);
    setQuickDomainInput('');
    setQuickDomainModalOpen(true);
  };

  const handleDeployStackTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStackTemplate || !stackTemplateContainerName.trim()) {
      showNotification('error', 'Nome Obrigatório', 'Informe um nome para o container.');
      return;
    }

    setIsSubmittingStackTemplate(true);
    try {
      const envLines: string[] = [];
      if (selectedStackTemplate.id === 'postgres') {
        envLines.push(`POSTGRES_USER=${stackTemplateFieldValues.POSTGRES_USER || 'postgres'}`);
        envLines.push(`POSTGRES_PASSWORD=${stackTemplateFieldValues.POSTGRES_PASSWORD || 'Postgres2026!Sec'}`);
        envLines.push(`POSTGRES_DB=${stackTemplateFieldValues.POSTGRES_DB || 'app_production'}`);
        envLines.push('PGDATA=/var/lib/postgresql/data/pgdata');
      } else if (selectedStackTemplate.id === 'redis') {
        if (stackTemplateFieldValues.REDIS_PASSWORD) {
          envLines.push(`REDIS_PASSWORD=${stackTemplateFieldValues.REDIS_PASSWORD}`);
        }
      } else if (selectedStackTemplate.id === 'mariadb') {
        envLines.push(`MARIADB_USER=${stackTemplateFieldValues.MARIADB_USER || 'app_user'}`);
        envLines.push(`MARIADB_PASSWORD=${stackTemplateFieldValues.MARIADB_PASSWORD || 'MariaDB@2026Pass'}`);
        envLines.push(`MARIADB_ROOT_PASSWORD=${stackTemplateFieldValues.MARIADB_ROOT_PASSWORD || 'RootRoot@2026!'}`);
        envLines.push(`MARIADB_DATABASE=${stackTemplateFieldValues.MARIADB_DATABASE || 'app_database'}`);
      } else if (selectedStackTemplate.fields) {
        selectedStackTemplate.fields.forEach((f: any) => {
          const val = stackTemplateFieldValues[f.key];
          if (val) envLines.push(`${f.key}=${val}`);
        });
      }

      let cmd: string | undefined = undefined;
      if (selectedStackTemplate.id === 'redis' && stackTemplateFieldValues.REDIS_PASSWORD) {
        cmd = `redis-server --requirepass ${stackTemplateFieldValues.REDIS_PASSWORD}`;
      }

      const res = await authFetch(`/api/services/${service.id}/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: stackTemplateContainerName.trim(),
          image: selectedStackTemplate.defaultImage,
          internalPort: selectedStackTemplate.defaultPort,
          hostPort: stackTemplateHostPort ? Number(stackTemplateHostPort) : undefined,
          envVars: envLines.join('\n'),
          command: cmd,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showNotification(
          'success',
          'Componente Adicionado',
          `Template "${selectedStackTemplate.name}" adicionado à stack como "${stackTemplateContainerName}".`
        );
        setStackTemplateModalOpen(false);
        setSelectedStackTemplate(null);
        await fetchContainers();
        if (onRefreshData) onRefreshData();
      } else {
        showNotification('error', 'Falha ao adicionar template', data.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setIsSubmittingStackTemplate(false);
    }
  };

  // States: Modal Envs da Instância Individual (Portainer Style)
  const [instanceEnvModalContainer, setInstanceEnvModalContainer] = useState<string | null>(null);
  const [instanceEnvBaseStr, setInstanceEnvBaseStr] = useState('');
  const [instanceEnvCustomStr, setInstanceEnvCustomStr] = useState('');
  const [instanceEnvBaseMap, setInstanceEnvBaseMap] = useState<Record<string, string>>({});
  const [instanceEnvCustomMap, setInstanceEnvCustomMap] = useState<Record<string, string>>({});
  const [instanceEnvEffectiveMap, setInstanceEnvEffectiveMap] = useState<Record<string, string>>({});
  const [instanceEnvLoading, setInstanceEnvLoading] = useState(false);
  const [instanceEnvSaving, setInstanceEnvSaving] = useState(false);
  const [instanceEnvTab, setInstanceEnvTab] = useState<'visual' | 'raw' | 'merged'>('visual');
  const [instanceEnvFilter, setInstanceEnvFilter] = useState('');
  const [instanceEnvVisibleSecrets, setInstanceEnvVisibleSecrets] = useState<Record<number, boolean>>({});

  // Convert instanceEnvCustomStr to structured rows for visual table
  const instanceEnvRows = useMemo(() => {
    if (!instanceEnvCustomStr.trim()) return [];
    return instanceEnvCustomStr
      .split('\n')
      .map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return null;
        const eqIdx = trimmed.indexOf('=');
        const k = eqIdx === -1 ? trimmed : trimmed.substring(0, eqIdx).trim();
        const v = eqIdx === -1 ? '' : trimmed.substring(eqIdx + 1).trim();
        const lowerKey = k.toLowerCase();
        const isSecret =
          lowerKey.includes('pass') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('key') ||
          lowerKey.includes('token') ||
          lowerKey.includes('auth');
        return {
          id: `inst-env-${idx}-${k}`,
          key: k,
          value: v,
          isSecret,
        };
      })
      .filter((r): r is { id: string; key: string; value: string; isSecret: boolean } => r !== null);
  }, [instanceEnvCustomStr]);

  const filteredInstanceEnvRows = useMemo(() => {
    if (!instanceEnvFilter.trim()) return instanceEnvRows;
    const lower = instanceEnvFilter.toLowerCase();
    return instanceEnvRows.filter(
      (r) => r.key.toLowerCase().includes(lower) || r.value.toLowerCase().includes(lower)
    );
  }, [instanceEnvRows, instanceEnvFilter]);

  const handleUpdateInstanceEnvRow = (index: number, newKey: string, newValue: string) => {
    const current = [...instanceEnvRows];
    if (index >= 0 && index < current.length) {
      current[index].key = newKey.trim().toUpperCase();
      current[index].value = newValue;
      setInstanceEnvCustomStr(current.map((r) => `${r.key}=${r.value}`).join('\n'));
    }
  };

  const handleRemoveInstanceEnvRow = (index: number) => {
    const current = [...instanceEnvRows];
    current.splice(index, 1);
    setInstanceEnvCustomStr(current.map((r) => `${r.key}=${r.value}`).join('\n'));
  };

  const handleAddInstanceEnvRow = () => {
    const current = [...instanceEnvRows, { id: `new-${Date.now()}`, key: 'NOVA_VARIAVEL', value: '', isSecret: false }];
    setInstanceEnvCustomStr(current.map((r) => `${r.key}=${r.value}`).join('\n'));
  };

  const handleInsertInstancePreset = (preset: 'common' | 'db_postgres' | 'redis') => {
    let toAppend = '';
    if (preset === 'common') {
      toAppend = `PORT=80\nNODE_ENV=production\nTZ=America/Sao_Paulo\nLOG_LEVEL=info`;
    } else if (preset === 'db_postgres') {
      toAppend = `POSTGRES_USER=postgres\nPOSTGRES_PASSWORD=Postgres2026!Sec\nPOSTGRES_DB=app_db`;
    } else if (preset === 'redis') {
      toAppend = `REDIS_PASSWORD=Redis2026!Sec`;
    }
    const next = instanceEnvCustomStr.trim() ? `${instanceEnvCustomStr.trim()}\n${toAppend}` : toAppend;
    setInstanceEnvCustomStr(next);
    showNotification('success', 'Preset Adicionado', 'Variáveis inseridas.');
  };

  const toggleInstanceSecret = (idx: number) => {
    setInstanceEnvVisibleSecrets((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleExportInstanceEnv = () => {
    const blob = new Blob([instanceEnvCustomStr], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${instanceEnvModalContainer || 'instance'}.env`;
    link.click();
    URL.revokeObjectURL(url);
    showNotification('success', 'Download Iniciado', 'Arquivo .env exportado com sucesso.');
  };

  const handleImportInstanceEnv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setInstanceEnvCustomStr(content);
        showNotification('success', 'Arquivo Importado', 'Conteúdo do .env carregado no editor.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Handler: Criar nova instância na stack
  const handleAddInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstanceName.trim() || !newInstanceImage.trim()) {
      showNotification('error', 'Campos Obrigatórios', 'Nome e imagem Docker são obrigatórios.');
      return;
    }
    setIsSubmittingNewInstance(true);
    try {
      const res = await authFetch(`/api/services/${service.id}/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newInstanceName.trim(),
          image: newInstanceImage.trim(),
          internalPort: newInstancePort ? Number(newInstancePort) : undefined,
          hostPort: newInstanceHostPort ? Number(newInstanceHostPort) : undefined,
          envVars: newInstanceEnvs,
          volumes: newInstanceVolumes,
          command: newInstanceCommand,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('success', 'Instância Adicionada', `Nova instância "${newInstanceName}" criada e anexada à stack.`);
        setAddInstanceModalOpen(false);
        await fetchContainers();
        if (onRefreshData) onRefreshData();
      } else {
        showNotification('error', 'Falha ao criar instância', data.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setIsSubmittingNewInstance(false);
    }
  };

  // Handler: Abrir modal de envs da réplica
  const handleOpenInstanceEnvModal = async (cName: string) => {
    setInstanceEnvModalContainer(cName);
    setInstanceEnvLoading(true);
    setInstanceEnvTab('visual');
    try {
      const res = await authFetch(`/api/services/${service.id}/instances/${encodeURIComponent(cName)}/env`);
      const data = await res.json();
      if (res.ok) {
        setInstanceEnvBaseStr(data.baseEnvStr || '');
        setInstanceEnvCustomStr(data.instanceEnvStr || '');
        setInstanceEnvBaseMap(data.baseMap || {});
        setInstanceEnvCustomMap(data.instanceMap || {});
        setInstanceEnvEffectiveMap(data.effectiveMap || {});
      } else {
        showNotification('error', 'Erro ao carregar variáveis', data.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setInstanceEnvLoading(false);
    }
  };

  // Handler: Salvar envs da réplica e recriar container
  const handleSaveInstanceEnv = async () => {
    if (!instanceEnvModalContainer) return;
    setInstanceEnvSaving(true);
    try {
      const res = await authFetch(`/api/services/${service.id}/instances/${encodeURIComponent(instanceEnvModalContainer)}/env`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envVars: instanceEnvCustomStr }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(
          'success',
          'Envs Atualizadas',
          `Variáveis salvas e instância "${instanceEnvModalContainer}" recriada com sucesso.`
        );
        setInstanceEnvModalContainer(null);
        await fetchContainers();
        if (onRefreshData) onRefreshData();
      } else {
        showNotification('error', 'Falha ao salvar', data.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setInstanceEnvSaving(false);
    }
  };

  // Fetch Logs for Modal
  const fetchModalLogs = async () => {
    if (!modalLogsContainer) return;
    setModalLogsLoading(true);
    try {
      const res = await authFetch(`/api/docker/containers/${modalLogsContainer}/logs?tail=${modalLogsTail}`);
      if (res.ok) {
        const data = await res.json();
        setModalLogsContent(data.logs || 'Sem logs registrados para este container.');
      } else {
        setModalLogsContent(`Falha ao obter logs: HTTP ${res.status}`);
      }
    } catch (err: any) {
      setModalLogsContent(`Erro de conexão: ${err.message}`);
    } finally {
      setModalLogsLoading(false);
    }
  };

  useEffect(() => {
    if (modalLogsContainer) {
      fetchModalLogs();
    }
  }, [modalLogsContainer, modalLogsTail]);

  useEffect(() => {
    if (!modalLogsContainer || !modalLogsAutoRefresh) return;
    const interval = setInterval(() => {
      fetchModalLogs();
    }, 3000);
    return () => clearInterval(interval);
  }, [modalLogsContainer, modalLogsAutoRefresh, modalLogsTail]);

  // Terminal Modal Init & Execution
  useEffect(() => {
    if (modalTerminalContainer) {
      setModalTerminalHistory([
        {
          id: `init-${Date.now()}`,
          command: `# session-init (${modalTerminalContainer})`,
          output: `\x1b[1;36m=== Console Interativo & Terminal Docker Web ===\x1b[0m\nContainer: \x1b[32m${modalTerminalContainer}\x1b[0m\nShell: \x1b[34m${modalTerminalShell}\x1b[0m | Usuário: \x1b[32mroot\x1b[0m\n\n💡 Digite comandos no prompt abaixo ou utilize os botões de atalho rápido.`,
          exitCode: 0,
          time: new Date().toLocaleTimeString(),
        },
      ]);
      setTimeout(() => {
        modalTerminalInputRef.current?.focus();
      }, 100);
    }
  }, [modalTerminalContainer, modalTerminalShell]);

  const handleExecuteModalTerminal = async (cmdToRun?: string) => {
    const cmd = (cmdToRun !== undefined ? cmdToRun : modalTerminalCmd).trim();
    if (!cmd || !modalTerminalContainer) return;

    if (cmd.toLowerCase() === 'clear') {
      setModalTerminalHistory([]);
      setModalTerminalCmd('');
      setModalTerminalHistoryIndex(-1);
      return;
    }

    setModalTerminalExecuting(true);
    setModalTerminalCmdHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd)].slice(0, 50));
    setModalTerminalHistoryIndex(-1);
    setModalTerminalCmd('');

    try {
      const res = await authFetch(`/api/services/${service.id}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cmd,
          shell: modalTerminalShell,
          containerName: modalTerminalContainer,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setModalTerminalHistory((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            command: cmd,
            output: `\x1b[31mErro: ${data.error || 'Falha ao executar comando no container'}\x1b[0m`,
            exitCode: 1,
            time: new Date().toLocaleTimeString(),
          },
        ]);
      } else {
        setModalTerminalHistory((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            command: cmd,
            output: data.output || '(Comando executado sem retorno)',
            exitCode: data.exitCode ?? 0,
            time: new Date().toLocaleTimeString(),
          },
        ]);
      }
    } catch (err: any) {
      setModalTerminalHistory((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          command: cmd,
          output: `\x1b[31mFalha de comunicação: ${err.message}\x1b[0m`,
          exitCode: 1,
          time: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setModalTerminalExecuting(false);
      setTimeout(() => {
        modalTerminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        modalTerminalInputRef.current?.focus();
      }, 50);
    }
  };

  // Fetch Build History
  const fetchBuildsHistory = async () => {
    if (sourceType !== 'GITHUB') return;
    setIsLoadingBuilds(true);
    try {
      const res = await authFetch(`/api/services/${service.id}/builds`);
      if (res.ok) {
        setBuildsHistory(await res.json());
      }
    } catch {} finally {
      setIsLoadingBuilds(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'build') {
      fetchBuildsHistory();
    }
  }, [activeTab]);

  // Poll service status and build logs if build is running
  useEffect(() => {
    const effectiveStatus = liveBuildStatus || service.buildStatus;
    const isBuilding = effectiveStatus === 'cloning' || effectiveStatus === 'building' || isTriggeringRebuild;
    if (!isBuilding && activeTab !== 'build') return;

    const interval = setInterval(async () => {
      try {
        const res = await authFetch(`/api/services/${service.id}`);
        if (res.ok) {
          const freshSvc = await res.json();
          if (freshSvc.buildLogs) setLiveBuildLogs(freshSvc.buildLogs);
          if (freshSvc.buildStatus) setLiveBuildStatus(freshSvc.buildStatus);
          if (freshSvc.buildStatus !== 'cloning' && freshSvc.buildStatus !== 'building') {
            setIsTriggeringRebuild(false);
            fetchBuildsHistory();
            if (onRefreshData) onRefreshData();
          }
        }
      } catch {}
    }, 2500);

    return () => clearInterval(interval);
  }, [service.buildStatus, liveBuildStatus, activeTab, isTriggeringRebuild]);

  // Trigger manual rebuild
  const handleTriggerManualBuild = async () => {
    setIsTriggeringRebuild(true);
    setLiveBuildStatus('cloning');
    try {
      const res = await authFetch(`/api/services/${service.id}/rebuild`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showNotification('info', 'Build Iniciado', 'Compilação disparada a partir do repositório Git.');
        setLiveBuildLogs(`[${new Date().toISOString()}] Enfileirado no Worker...\n`);
        if (onRefreshData) onRefreshData();
        fetchBuildsHistory();
      } else {
        showNotification('error', 'Falha ao Disparar Build', data.error);
        setIsTriggeringRebuild(false);
        setLiveBuildStatus(service.buildStatus);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
      setIsTriggeringRebuild(false);
      setLiveBuildStatus(service.buildStatus);
    }
  };

  // Scale Component Replicas
  const handleScaleComponent = async (composeService: string, targetCount?: number) => {
    const count = targetCount !== undefined ? targetCount : (desiredScale[composeService] || 1);
    setScalingComponent(composeService);
    try {
      const res = await authFetch(`/api/services/${service.id}/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ composeService, replicas: count }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(
          'success',
          'Escala Atualizada',
          `Componente "${composeService}" ajustado para ${data.replicas} réplica(s).`
        );
        await fetchContainers();
        if (onRefreshData) onRefreshData();
      } else {
        showNotification('error', 'Falha ao escalar serviço', data.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setScalingComponent(null);
    }
  };

  // Group containers by compose service / component
  const groupedContainers = useMemo(() => {
    const groups: Record<
      string,
      {
        serviceName: string;
        image: string;
        containers: DockerContainerInfo[];
        runningCount: number;
        totalCount: number;
      }
    > = {};

    containersList.forEach((c) => {
      let compKey = c.composeService;
      if (!compKey) {
        if (c.composeProject) {
          const parts = c.name.split(/[-_]/);
          if (parts.length >= 3 && !isNaN(Number(parts[parts.length - 1]))) {
            compKey = parts.slice(1, -1).join('-');
          } else {
            compKey = c.name;
          }
        } else {
          compKey = c.name.replace(/-\d+$/, '');
        }
      }

      if (!groups[compKey]) {
        groups[compKey] = {
          serviceName: compKey,
          image: c.image,
          containers: [],
          runningCount: 0,
          totalCount: 0,
        };
      }

      groups[compKey].containers.push(c);
      groups[compKey].totalCount++;
      if (c.state === 'running' || c.status === 'running') {
        groups[compKey].runningCount++;
      }
    });

    Object.values(groups).forEach((g) => {
      g.containers.sort((a, b) => {
        const numA = parseInt(a.labels?.['com.docker.compose.container-number'] || '0', 10);
        const numB = parseInt(b.labels?.['com.docker.compose.container-number'] || '0', 10);
        if (numA && numB) return numA - numB;
        return a.name.localeCompare(b.name);
      });
    });

    return groups;
  }, [containersList]);

  // Keep desiredScale synced with current counts when containers load
  useEffect(() => {
    setDesiredScale((prev) => {
      const next = { ...prev };
      Object.entries(groupedContainers).forEach(([key, g]) => {
        if (next[key] === undefined) {
          next[key] = g.totalCount;
        }
      });
      return next;
    });
  }, [groupedContainers]);

  // Sync state when service prop updates
  useEffect(() => {
    setName(service.name);
    setContainerName(service.containerName);
    setInternalPort(service.internalPort);
    setImage(service.image || '');
    setNotes((service.notes || '').replace(/<!--dm-meta:[\s\S]*?-->/g, '').trim());
    setIsActive(service.isActive);
    setIsDefault(service.isDefault);
    setSourceType(service.sourceType || 'IMAGE');
    setGitRepoUrl(service.gitRepoUrl || '');
    setGitBranch(service.gitBranch || 'main');
    setDockerfilePath(service.dockerfilePath || 'Dockerfile');
    setRestartPolicy(service.restartPolicy || 'unless-stopped');
    setMemoryLimitMb(service.memoryLimitMb || '');
    setCpuLimit(service.cpuLimit || '');
    setCommand(service.command || '');
    setVolumes(service.volumes || '');
    setNetwork(service.network || 'proxy-net');
    setRawEnv(service.envVars || '');
  }, [service.id]);

  // Convert rawEnv to structured rows
  const envRows: EnvRow[] = useMemo(() => {
    if (!rawEnv.trim()) return [];
    return rawEnv
      .split('\n')
      .map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return null;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) {
          return {
            id: `env-${idx}-${trimmed}`,
            key: trimmed,
            value: '',
            isSecret: false,
            showSecret: false,
          };
        }
        const k = trimmed.substring(0, eqIdx).trim();
        const v = trimmed.substring(eqIdx + 1).trim();
        const lowerKey = k.toLowerCase();
        const isSecret =
          lowerKey.includes('pass') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('key') ||
          lowerKey.includes('token') ||
          lowerKey.includes('auth');
        return {
          id: `env-${idx}-${k}`,
          key: k,
          value: v,
          isSecret,
          showSecret: false,
        };
      })
      .filter((r): r is EnvRow => r !== null);
  }, [rawEnv]);

  // Filtered rows for visual search
  const filteredEnvRows = useMemo(() => {
    if (!envFilter.trim()) return envRows;
    const lower = envFilter.toLowerCase();
    return envRows.filter(
      (r) => r.key.toLowerCase().includes(lower) || r.value.toLowerCase().includes(lower)
    );
  }, [envRows, envFilter]);

  // Track if any changes have been made
  const isDirty = useMemo(() => {
    return (
      name !== service.name ||
      containerName !== service.containerName ||
      internalPort !== service.internalPort ||
      image !== (service.image || '') ||
      notes !== (service.notes || '') ||
      isActive !== service.isActive ||
      isDefault !== service.isDefault ||
      sourceType !== (service.sourceType || 'IMAGE') ||
      gitRepoUrl !== (service.gitRepoUrl || '') ||
      gitBranch !== (service.gitBranch || 'main') ||
      dockerfilePath !== (service.dockerfilePath || 'Dockerfile') ||
      rawEnv !== (service.envVars || '') ||
      restartPolicy !== (service.restartPolicy || 'unless-stopped') ||
      (memoryLimitMb || undefined) !== service.memoryLimitMb ||
      (cpuLimit || undefined) !== service.cpuLimit ||
      command !== (service.command || '') ||
      volumes !== (service.volumes || '') ||
      network !== (service.network || 'proxy-net')
    );
  }, [
    service,
    name,
    containerName,
    internalPort,
    image,
    notes,
    isActive,
    isDefault,
    sourceType,
    gitRepoUrl,
    gitBranch,
    dockerfilePath,
    rawEnv,
    restartPolicy,
    memoryLimitMb,
    cpuLimit,
    command,
    volumes,
    network,
  ]);

  // Associated domains
  const serviceDomains = useMemo(() => {
    return domains.filter((d) => d.serviceId === service.id);
  }, [domains, service.id]);

  // Fetch Container Logs
  const fetchLogs = async (cName?: string) => {
    const target = cName || targetContainerFocus || service.containerName;
    setIsLoadingLogs(true);
    try {
      const res = await authFetch(`/api/docker/containers/${target}/logs?tail=200`);
      if (res.ok) {
        const data = await res.json();
        setLogsContent(data.logs || `Sem logs registrados para o container ${target}.`);
      } else {
        setLogsContent(`Falha ao carregar logs do container ${target}: HTTP ${res.status}`);
      }
    } catch (err: any) {
      setLogsContent(`Erro de conexão ao buscar logs: ${err.message}`);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [activeTab, targetContainerFocus]);

  // SSH and Terminal Logic
  const fetchSshInfo = async (cName?: string) => {
    const target = cName || targetContainerFocus || service.containerName;
    setIsLoadingSshInfo(true);
    try {
      const res = await authFetch(`/api/services/${service.id}/ssh-info?container=${target}`);
      if (res.ok) {
        const data = await res.json();
        setSshInfo(data);
        if (data.serverHost && (!sshHostInput || sshHostInput === 'bla.com.br')) {
          setSshHostInput(data.serverHost);
        }
      }
    } catch (err) {
      console.warn('Falha ao obter metadados SSH:', err);
    } finally {
      setIsLoadingSshInfo(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'terminal') {
      fetchSshInfo();
      const target = targetContainerFocus || service.containerName;
      const targetObj = containersList.find((c) => c.name === target);

      setTerminalHistory([
        {
          id: `init-${target}-${Date.now()}`,
          command: `# session-init (${target})`,
          output: [
            `\x1b[1;36m=== Console Interativo & Terminal Web Docker ===\x1b[0m`,
            `Container Selecionado: \x1b[32m${target}\x1b[0m (Status: ${targetObj?.state || 'running'})`,
            `Stack/Compose: \x1b[33m${service.name}\x1b[0m | Imagem: \x1b[35m${targetObj?.image || image || 'alpine:latest'}\x1b[0m`,
            `Shell: \x1b[34m${selectedShell}\x1b[0m | Usuário: \x1b[32mroot\x1b[0m`,
            '',
            '💡 Digite qualquer comando no prompt abaixo, navegue com [↑] e [↓] pelo histórico, ou utilize os botões de atalho rápido.',
            '🔒 Para instruções de conexão SSH direta via seu terminal local / PuTTY, consulte o card de acesso externo logo abaixo.',
          ].join('\n'),
          exitCode: 0,
          time: new Date().toLocaleTimeString(),
          shell: selectedShell,
        },
      ]);
      setTimeout(() => {
        terminalInputRef.current?.focus();
      }, 100);
    }
  }, [activeTab, targetContainerFocus]);

  const renderAnsiOutput = (text: string) => {
    const parts = text.split(/(\x1b\[[0-9;]*m)/g);
    let currentClass = 'text-slate-200';

    return parts.map((part, i) => {
      if (part.startsWith('\x1b[')) {
        if (part === '\x1b[0m') currentClass = 'text-slate-200';
        else if (part.includes('31')) currentClass = 'text-rose-400 font-semibold';
        else if (part.includes('32')) currentClass = 'text-emerald-400 font-semibold';
        else if (part.includes('33')) currentClass = 'text-amber-300 font-semibold';
        else if (part.includes('34')) currentClass = 'text-blue-400 font-semibold';
        else if (part.includes('35')) currentClass = 'text-purple-400 font-semibold';
        else if (part.includes('36')) currentClass = 'text-cyan-300 font-semibold';
        else if (part.includes('1')) currentClass = 'text-white font-bold';
        return null;
      }
      return (
        <span key={i} className={currentClass}>
          {part}
        </span>
      );
    });
  };

  const handleExecuteTerminalCommand = async (cmdToRun?: string) => {
    const cmd = (cmdToRun !== undefined ? cmdToRun : currentCommand).trim();
    if (!cmd) return;

    if (cmd.toLowerCase() === 'clear') {
      setTerminalHistory([]);
      setCurrentCommand('');
      setHistoryIndex(-1);
      return;
    }

    setIsExecutingCommand(true);
    setCommandHistoryList((prev) => [cmd, ...prev.filter((c) => c !== cmd)].slice(0, 50));
    setHistoryIndex(-1);
    setCurrentCommand('');

    try {
      const target = targetContainerFocus || service.containerName;
      const res = await authFetch(`/api/services/${service.id}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: cmd,
          shell: selectedShell,
          containerName: target,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setTerminalHistory((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            command: cmd,
            output: `\x1b[31mErro na execução: ${data.error || 'Falha ao executar comando no container'}\x1b[0m`,
            exitCode: 1,
            time: new Date().toLocaleTimeString(),
            shell: selectedShell,
          },
        ]);
      } else if (data.output === '__CLEAR__') {
        setTerminalHistory([]);
      } else {
        setTerminalHistory((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            command: cmd,
            output: data.output || '(Comando executado sem retorno na saída padrão)',
            exitCode: data.exitCode ?? 0,
            time: new Date().toLocaleTimeString(),
            shell: selectedShell,
          },
        ]);
      }
    } catch (err: any) {
      setTerminalHistory((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          command: cmd,
          output: `\x1b[31mFalha de comunicação: ${err.message}\x1b[0m`,
          exitCode: 1,
          time: new Date().toLocaleTimeString(),
          shell: selectedShell,
        },
      ]);
    } finally {
      setIsExecutingCommand(false);
      setTimeout(() => {
        terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        terminalInputRef.current?.focus();
      }, 50);
    }
  };

  const handleTerminalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleExecuteTerminalCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistoryList.length === 0) return;
      const nextIndex = Math.min(historyIndex + 1, commandHistoryList.length - 1);
      setHistoryIndex(nextIndex);
      setCurrentCommand(commandHistoryList[nextIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setCurrentCommand('');
      } else {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setCurrentCommand(commandHistoryList[nextIndex]);
      }
    } else if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      setTerminalHistory([]);
    }
  };

  const handleDownloadTerminalLog = () => {
    const content = terminalHistory
      .map(
        (entry) =>
          `[${entry.time}] root@${containerName}:${entry.shell}# ${entry.command}\n${entry.output.replace(
            /\x1b\[[0-9;]*m/g,
            ''
          )}\n---`
      )
      .join('\n\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `terminal_${containerName}_${Date.now()}.log`;
    link.click();
    URL.revokeObjectURL(url);
    showNotification('success', 'Download Iniciado', 'Arquivo de log do terminal baixado com sucesso.');
  };

  // Save handler
  const handleSave = async (): Promise<boolean> => {
    if (!name.trim()) {
      showNotification('error', 'Validação', 'O nome do serviço é obrigatório.');
      return false;
    }
    if (!containerName.trim()) {
      showNotification('error', 'Validação', 'O nome do container é obrigatório.');
      return false;
    }
    const portNum = Number(internalPort);
    if (!portNum || portNum < 1 || portNum > 65535) {
      showNotification('error', 'Validação', 'A porta interna deve estar entre 1 e 65535.');
      return false;
    }

    setIsSaving(true);
    try {
      const success = await onUpdateService(service.id, {
        name: name.trim(),
        containerName: containerName.trim(),
        internalPort: portNum,
        image: image.trim(),
        notes: notes.trim(),
        isActive,
        isDefault,
        sourceType,
        gitRepoUrl: sourceType === 'GITHUB' ? gitRepoUrl.trim() : undefined,
        gitBranch: sourceType === 'GITHUB' ? gitBranch.trim() : undefined,
        dockerfilePath: sourceType === 'GITHUB' ? dockerfilePath.trim() : undefined,
        buildContext: sourceType === 'GITHUB' ? (buildContext.trim() || '.') : undefined,
        envVars: rawEnv,
        restartPolicy: restartPolicy as any,
        memoryLimitMb: memoryLimitMb ? Number(memoryLimitMb) : undefined,
        cpuLimit: cpuLimit ? Number(cpuLimit) : undefined,
        command: command.trim() || undefined,
        volumes: volumes.trim() || undefined,
        network: network.trim() || 'proxy-net',
      });

      if (success) {
        showNotification(
          'success',
          'Configurações Salvas',
          `As configurações do serviço "${name}" foram aplicadas com sucesso.`
        );
      }
      return Boolean(success);
    } catch (err: any) {
      showNotification('error', 'Erro ao Salvar', err.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Env Helper methods
  const updateRawFromRows = (newRows: Array<{ key: string; value: string }>) => {
    const text = newRows.map((r) => `${r.key}=${r.value}`).join('\n');
    setRawEnv(text);
  };

  const handleUpdateEnvRow = (index: number, newKey: string, newValue: string) => {
    const current = [...envRows];
    if (index >= 0 && index < current.length) {
      current[index].key = newKey.trim().toUpperCase();
      current[index].value = newValue;
      updateRawFromRows(current);
    }
  };

  const handleRemoveEnvRow = (index: number) => {
    const current = [...envRows];
    current.splice(index, 1);
    updateRawFromRows(current);
  };

  const handleAddEnvRow = () => {
    const current = [...envRows, { key: 'NOVA_VARIAVEL', value: '' }];
    updateRawFromRows(current);
  };

  const handleInsertPreset = (preset: 'common' | 'db_postgres' | 'db_mysql' | 'redis') => {
    let toAppend = '';
    if (preset === 'common') {
      toAppend = `PORT=${internalPort}\nNODE_ENV=production\nTZ=America/Sao_Paulo\nLOG_LEVEL=info`;
    } else if (preset === 'db_postgres') {
      toAppend = `DATABASE_URL=postgresql://postgres:sua_senha@postgres-db:5432/appdb\nDB_HOST=postgres-db\nDB_PORT=5432\nDB_USER=postgres\nDB_PASSWORD=sua_senha\nDB_NAME=appdb`;
    } else if (preset === 'db_mysql') {
      toAppend = `DATABASE_URL=mysql://root:sua_senha@mariadb:3306/appdb\nDB_HOST=mariadb\nDB_PORT=3306\nDB_USER=root\nDB_PASSWORD=sua_senha\nDB_NAME=appdb`;
    } else if (preset === 'redis') {
      toAppend = `REDIS_URL=redis://:sua_senha@redis-cache:6379\nREDIS_HOST=redis-cache\nREDIS_PORT=6379`;
    }

    if (!rawEnv.trim()) {
      setRawEnv(toAppend);
    } else {
      setRawEnv(`${rawEnv.trim()}\n${toAppend}`);
    }
    showNotification('success', 'Preset Adicionado', 'Variáveis de ambiente inseridas no editor.');
  };

  const handleCopyClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
    showNotification('success', 'Copiado', `${label} copiado para a área de transferência.`);
  };

  const handleExportEnv = () => {
    const blob = new Blob([rawEnv], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${containerName || 'service'}.env`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportEnv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content !== undefined) {
        setRawEnv(content);
        showNotification('success', 'Arquivo Importado', `Arquivo .env importado com sucesso.`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Quick domain linker
  const handleLinkDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainInput.trim()) return;
    setIsLinkingDomain(true);

    let targetC: any = selectedDomainContainer || containerName;
    let targetP = selectedDomainPort ? Number(selectedDomainPort) : internalPort;
    let healthPath: string | undefined = undefined;

    if (domainRoutingMode === 'load_balancer') {
      if (lbSelectedContainers.length === 0) {
        showNotification('warning', 'Seleção necessária', 'Selecione pelo menos um container para o Load Balancer.');
        setIsLinkingDomain(false);
        return;
      }
      const targets = lbSelectedContainers.map((cName) => {
        const cObj = containersList.find((c) => c.name === cName);
        const p = cObj?.ports?.find((port) => port.privatePort)?.privatePort || targetP;
        return { container: cName, port: p };
      });
      targetC = JSON.stringify(targets);
      healthPath = lbHealthCheckPath.trim() || undefined;
    }

    try {
      const res = await authFetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domainName: newDomainInput.trim(),
          serviceId: service.id,
          targetContainer: targetC,
          targetPort: targetP,
          healthCheckPath: healthPath,
          loadBalanceMode: domainRoutingMode === 'load_balancer' ? 'round_robin' : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(
          'success',
          domainRoutingMode === 'load_balancer' ? 'Load Balancer Configurado' : 'Domínio Vinculado',
          `Domínio ${newDomainInput.trim()} configurado com sucesso no Traefik.`
        );
        setNewDomainInput('');
        setLbSelectedContainers([]);
        if (onRefreshData) onRefreshData();
      } else {
        showNotification('error', 'Falha ao vincular domínio', data.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    } finally {
      setIsLinkingDomain(false);
    }
  };

  // Quick domain unlink
  const handleUnlinkDomain = async (domainId: string, domainName: string) => {
    try {
      const res = await authFetch(`/api/domains/${domainId}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('success', 'Domínio Desvinculado', `Domínio ${domainName} removido.`);
        if (onRefreshData) onRefreshData();
      } else {
        const data = await res.json();
        showNotification('error', 'Falha', data.error);
      }
    } catch (err: any) {
      showNotification('error', 'Erro', err.message);
    }
  };

  const isRunning = service.status === 'running';

  // Traefik routing expression preview
  const traefikRulePreview = useMemo(() => {
    if (serviceDomains.length === 0) {
      if (isDefault) {
        return 'HostRegexp(`{host:.+}`) [Catch-All Default Handler]';
      }
      return 'Nenhum domínio vinculado (Roteamento inativo no Traefik)';
    }
    const hostList = serviceDomains.map((d) => `\`${d.domainName}\``).join(', ');
    return `Host(${hostList})`;
  }, [serviceDomains, isDefault]);

  // Secret visibility toggle state per row
  const [visibleSecrets, setVisibleSecrets] = useState<Record<number, boolean>>({});
  const toggleSecret = (idx: number) => {
    setVisibleSecrets((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb Navigation & Power Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold"
            title="Voltar para a lista de serviços"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>

          <div className="h-6 w-px bg-slate-200" />

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">{name || service.name}</h1>
              {/* Running Status Badge */}
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  isRunning
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}
                />
                <span>{isRunning ? 'Em Execução' : 'Parado'}</span>
              </div>

              {service.isSwarm ? (
                <span className="text-[11px] font-semibold px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full flex items-center gap-1 shadow-2xs">
                  <Layers className="w-3 h-3 text-purple-600" />
                  <span>Modo Swarm (Ingress VIP Mesh)</span>
                </span>
              ) : (
                <span className="text-[11px] font-medium px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-full flex items-center gap-1">
                  <Box className="w-3 h-3 text-slate-500" />
                  <span>Standalone Docker</span>
                </span>
              )}

              {isDefault && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded">
                  Padrão (Catch-All)
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
              <span className="font-mono">Container: {containerName}</span>
              <span>·</span>
              <span className="font-mono">Porta: :{internalPort}</span>
              <span>·</span>
              <span className="font-mono truncate max-w-xs">{image}</span>
            </div>
          </div>
        </div>

        {/* Action Controls & Save */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Container Power controls */}
          {isRunning ? (
            <button
              onClick={async () => {
                await onStopContainer(service);
                await fetchContainers();
              }}
              className="px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg flex items-center gap-1.5 transition-colors"
              title="Parar Serviço"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Parar</span>
            </button>
          ) : (
            <button
              onClick={async () => {
                await onStartContainer(service);
                await fetchContainers();
              }}
              className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg flex items-center gap-1.5 transition-colors"
              title="Iniciar Serviço"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Iniciar</span>
            </button>
          )}

          <button
            onClick={async () => {
              await onRestartContainer(service);
              await fetchContainers();
            }}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg flex items-center gap-1.5 transition-colors"
            title="Reiniciar Serviço"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Reiniciar</span>
          </button>

          {sourceType === 'GITHUB' && onTriggerRebuild && (
            <button
              onClick={async () => {
                if (isDirty) {
                  const saved = await handleSave();
                  if (!saved) return;
                }
                onTriggerRebuild(service.id);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg flex items-center gap-1.5 transition-colors"
              title="Salvar e disparar novo build a partir do GitHub"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Rebuild Git</span>
            </button>
          )}

          <div className="h-6 w-px bg-slate-200 mx-1" />

          {/* Primary Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-2 shadow-xs transition-all ${
              isDirty
                ? 'bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-500/20 shadow-blue-500/10'
                : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            <Save className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
            <span>{isSaving ? 'Salvando...' : 'Salvar Alterações'}</span>
            {isDirty && (
              <span className="w-2 h-2 rounded-full bg-amber-300 animate-ping inline-block" />
            )}
          </button>

          {/* Delete Service */}
          <button
            onClick={() => onDeleteService(service)}
            className="p-2 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition-colors"
            title="Excluir Serviço Permanentemente"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Dirty state warning notice */}
      {isDirty && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Você possui alterações pendentes não salvas. Clique em <strong>Salvar Alterações</strong> para sincronizar com o banco e o proxy Traefik.
            </span>
          </div>
          <button
            onClick={handleSave}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold transition-colors shrink-0"
          >
            Salvar Agora
          </button>
        </div>
      )}

      {/* Main Tabbed Interface: 2-Column Vertical Navigation Layout */}
      <div className="flex flex-col lg:flex-row gap-5 items-start w-full">
        {/* Left Vertical Menu */}
        <div className="w-full lg:w-64 shrink-0 bg-white border border-slate-200 rounded-2xl p-2.5 shadow-2xs space-y-1 lg:sticky lg:top-4">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Navegação do Serviço
          </div>

          {/* 1. Containers */}
          <button
            type="button"
            onClick={() => setActiveTab('containers')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'containers'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <Boxes className={`w-4 h-4 shrink-0 ${activeTab === 'containers' ? 'text-white' : 'text-blue-600'}`} />
              <span className="truncate">Containers da Stack</span>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              activeTab === 'containers' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {containersList.length > 0 ? containersList.length : 1}
            </span>
          </button>

          {/* 2. Envs */}
          <button
            type="button"
            onClick={() => setActiveTab('env')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'env'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <Layers className={`w-4 h-4 shrink-0 ${activeTab === 'env' ? 'text-white' : 'text-slate-500'}`} />
              <span className="truncate">Variáveis (.env)</span>
            </div>
            {envRows.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'env' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}>
                {envRows.length}
              </span>
            )}
          </button>

          {/* 3. Geral & Roteamento */}
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'general'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <Server className={`w-4 h-4 shrink-0 ${activeTab === 'general' ? 'text-white' : 'text-slate-500'}`} />
              <span className="truncate">Geral & Roteamento</span>
            </div>
          </button>

          {/* 4. Domínios */}
          <button
            type="button"
            onClick={() => setActiveTab('domains')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'domains'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <Globe className={`w-4 h-4 shrink-0 ${activeTab === 'domains' ? 'text-white' : 'text-emerald-600'}`} />
              <span className="truncate">Domínios & Traefik</span>
            </div>
            {serviceDomains.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'domains' ? 'bg-blue-700 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}>
                {serviceDomains.length}
              </span>
            )}
          </button>

          {/* 5. Origem & CI/CD Git */}
          <button
            type="button"
            onClick={() => setActiveTab('build')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'build'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <GitBranch className={`w-4 h-4 shrink-0 ${activeTab === 'build' ? 'text-white' : 'text-blue-500'}`} />
              <span className="truncate">Origem & CI/CD Git</span>
            </div>
            {sourceType === 'GITHUB' && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'build' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                Git
              </span>
            )}
          </button>

          {/* 6. Docker Avançado */}
          <button
            type="button"
            onClick={() => setActiveTab('docker')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'docker'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <Settings className={`w-4 h-4 shrink-0 ${activeTab === 'docker' ? 'text-white' : 'text-slate-500'}`} />
              <span className="truncate">Docker Avançado</span>
            </div>
          </button>

          {/* 7. Terminal & SSH */}
          <button
            type="button"
            onClick={() => setActiveTab('terminal')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'terminal'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <TerminalSquare className={`w-4 h-4 shrink-0 ${activeTab === 'terminal' ? 'text-white' : 'text-emerald-600'}`} />
              <span className="truncate">Terminal & SSH</span>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 ${
              activeTab === 'terminal' ? 'bg-blue-700 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Exec
            </span>
          </button>

          {/* 8. Interconexão de Rede */}
          <button
            type="button"
            onClick={() => setActiveTab('connection')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'connection'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <Database className={`w-4 h-4 shrink-0 ${activeTab === 'connection' ? 'text-white' : 'text-slate-500'}`} />
              <span className="truncate">Interconexão de Rede</span>
            </div>
          </button>

          {/* 9. Logs em Tempo Real */}
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'logs'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2.5 truncate">
              <FileText className={`w-4 h-4 shrink-0 ${activeTab === 'logs' ? 'text-white' : 'text-slate-500'}`} />
              <span className="truncate">Logs em Tempo Real</span>
            </div>
          </button>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden w-full p-6">
          {/* TAB 0: CONTAINERS DA STACK / SERVIÇO */}
          {activeTab === 'containers' && (
            <div className="space-y-6">
              {/* Header and Stack Status */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-blue-600" />
                      <span>Containers da Stack / Serviço</span>
                    </h2>
                    {composeProject && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                        Docker Compose: {composeProject}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                    Este serviço gerencia o conjunto de containers abaixo. O container definido como <strong>Roteador HTTP</strong> recebe o tráfego dos domínios configurados no Traefik na porta interna <span className="font-mono font-semibold">:{internalPort}</span>.
                  </p>
                </div>

                {/* Right controls: View Mode, Link container & Refresh */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* View Mode Switcher */}
                  <div className="inline-flex p-0.5 bg-slate-200/80 rounded-lg text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setContainerViewMode('hierarchy')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
                        containerViewMode === 'hierarchy'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Agrupar por serviço/componente do Compose e controlar réplicas"
                    >
                      <Layers className="w-3 h-3" />
                      <span>Hierarquia & Escala</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setContainerViewMode('flat')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
                        containerViewMode === 'flat'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Exibir todos os containers em formato de tabela simples"
                    >
                      <Boxes className="w-3 h-3" />
                      <span>Lista Plana</span>
                    </button>
                  </div>

                  {/* Templates Prontos Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setStackTemplateModalOpen(true);
                      setSelectedStackTemplate(null);
                    }}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
                    title="Adicionar componente a partir de Templates Prontos (Redis, PostgreSQL, Adminer, pgAdmin, etc.)"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Templates Prontos</span>
                  </button>

                  {/* Add New Instance Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setNewInstanceName(`${service.containerName}-component`);
                      setNewInstanceImage('');
                      setNewInstancePort('');
                      setNewInstanceEnvs('');
                      setNewInstanceVolumes('');
                      setNewInstanceCommand('');
                      setAddInstanceModalOpen(true);
                    }}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors"
                    title="Adicionar uma nova instância/componente customizado a este agrupamento"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nova Instância</span>
                  </button>

                  {/* Container linker selector */}
                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                    <select
                      value={selectedContainerToLink}
                      onChange={(e) => setSelectedContainerToLink(e.target.value)}
                      className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[180px]"
                    >
                      <option value="">Vincular outro container...</option>
                      {availableContainers
                        .filter((ac) => !containersList.some((c) => c.name === ac.name || c.id === ac.id))
                        .map((ac) => (
                          <option key={ac.id} value={ac.name}>
                            {ac.name} ({ac.image})
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleLinkContainer}
                      disabled={!selectedContainerToLink || isLinkingContainer}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded flex items-center gap-1 transition-colors"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>{isLinkingContainer ? 'Vinculando...' : 'Vincular'}</span>
                    </button>
                  </div>

                  <button
                    onClick={fetchContainers}
                    disabled={isLoadingContainers}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                    title="Atualizar status dos containers"
                  >
                    <RotateCw className={`w-4 h-4 ${isLoadingContainers ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* CONTAINERS HIERARCHICAL VIEW (GROUPED BY COMPOSE SERVICE WITH SCALING) */}
              {containerViewMode === 'hierarchy' ? (
                <div className="space-y-4">
                  {Object.keys(groupedContainers).length === 0 ? (
                    <div className="p-8 text-center text-slate-400 border border-slate-200 rounded-xl bg-white">
                      {isLoadingContainers ? (
                        <div className="flex items-center justify-center gap-2">
                          <RotateCw className="w-4 h-4 animate-spin text-blue-600" />
                          <span>Carregando containers da stack...</span>
                        </div>
                      ) : (
                        <span>Nenhum container encontrado para este serviço.</span>
                      )}
                    </div>
                  ) : (
                    Object.entries(groupedContainers).map(([compKey, group]) => {
                      const isCollapsed = !!collapsedComponents[compKey];
                      const currentDesired = desiredScale[compKey] || group.totalCount;
                      const isDirtyScale = currentDesired !== group.totalCount;
                      const isScaling = scalingComponent === compKey;

                      // Metadados no nível da Instância / Componente
                      const replicaNames = group.containers.map((c) => c.name);
                      const isPrimaryComponent =
                        group.containers.some((c) => c.isPrimary) ||
                        replicaNames.includes(containerName) ||
                        group.serviceName === containerName;

                      const detectedCompPort =
                        (group.containers.find((c) => (c as any).detectedPort) as any)?.detectedPort ||
                        group.containers.flatMap((c) => c.ports || []).find((p) => p.privatePort)?.privatePort ||
                        (isPrimaryComponent ? internalPort : 80);

                      const compDomains = serviceDomains.filter((d) => {
                        if (!d.targetContainer) return isPrimaryComponent;
                        if (d.targetContainer.startsWith('[')) {
                          return replicaNames.some((rName) => d.targetContainer!.includes(`"${rName}"`));
                        }
                        return d.targetContainer === group.serviceName || replicaNames.includes(d.targetContainer);
                      });

                      const publishedPortSetting = publishedPorts[group.serviceName] || publishedPorts[compKey];
                      const containerHostPort = group.containers
                        .flatMap((c) => c.ports || [])
                        .find((p) => p.publicPort)?.publicPort;
                      const publishedHostPort = publishedPortSetting?.hostPort || containerHostPort;

                      return (
                        <div
                          key={compKey}
                          className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white transition-all"
                        >
                          {/* Component / Service Parent Header */}
                          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              {/* Toggle Accordion */}
                              <button
                                type="button"
                                onClick={() =>
                                  setCollapsedComponents((prev) => ({
                                    ...prev,
                                    [compKey]: !prev[compKey],
                                  }))
                                }
                                className="p-1 hover:bg-slate-200/80 rounded transition-colors text-slate-600"
                                title={isCollapsed ? 'Expandir réplicas' : 'Recolher réplicas'}
                              >
                                {isCollapsed ? (
                                  <ChevronRight className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-indigo-600" />
                                )}
                              </button>

                              <div className="flex items-center gap-2">
                                <Boxes className="w-4 h-4 text-indigo-600 shrink-0" />
                                <span className="font-mono font-bold text-slate-900 text-sm">
                                  {group.serviceName}
                                </span>
                                {isPrimaryComponent && (
                                  <span
                                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 shadow-2xs flex items-center gap-1"
                                    title="Esta instância é o Roteador Principal da stack"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                                    <span>Principal (:{internalPort})</span>
                                  </span>
                                )}
                              </div>

                              {/* Replicas status pill */}
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                  group.runningCount === group.totalCount
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    group.runningCount === group.totalCount ? 'bg-emerald-500' : 'bg-amber-500'
                                  }`}
                                />
                                <span>
                                  {group.runningCount}/{group.totalCount} Réplica(s)
                                </span>
                              </span>

                              {/* Base Image */}
                              <span
                                className="text-slate-400 font-mono text-[11px] truncate max-w-[200px]"
                                title={group.image}
                              >
                                {group.image}
                              </span>
                            </div>

                            {/* Scale Control & Quick Actions */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Stepper Scale Control */}
                              <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5 shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDesiredScale((prev) => ({
                                      ...prev,
                                      [compKey]: Math.max(1, (prev[compKey] || group.totalCount) - 1),
                                    }))
                                  }
                                  disabled={isScaling || currentDesired <= 1}
                                  className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 rounded transition-colors"
                                  title="Diminuir réplicas"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>

                                <span className="font-mono font-bold text-xs px-2 text-center min-w-[28px] text-slate-900">
                                  {currentDesired}
                                </span>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setDesiredScale((prev) => ({
                                      ...prev,
                                      [compKey]: Math.min(20, (prev[compKey] || group.totalCount) + 1),
                                    }))
                                  }
                                  disabled={isScaling || currentDesired >= 20}
                                  className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 rounded transition-colors"
                                  title="Aumentar réplicas"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* Apply Scale Button */}
                              <button
                                type="button"
                                onClick={() => handleScaleComponent(group.serviceName, currentDesired)}
                                disabled={isScaling}
                                className={`px-2.5 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-2xs ${
                                  isDirtyScale
                                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white animate-pulse'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                                title={
                                  isDirtyScale
                                    ? `Aplicar escala: alterar de ${group.totalCount} para ${currentDesired} réplica(s)`
                                    : 'Escalar serviço'
                                }
                              >
                                <Scale className={`w-3.5 h-3.5 ${isScaling ? 'animate-spin' : ''}`} />
                                <span>
                                  {isScaling
                                    ? 'Escalando...'
                                    : isDirtyScale
                                    ? `Escalar para ${currentDesired}`
                                    : 'Escalar'}
                                </span>
                              </button>

                              {/* Batch restart for all replicas in this component */}
                              <button
                                type="button"
                                onClick={async () => {
                                  for (const c of group.containers) {
                                    await handleContainerPower(c.name, 'restart');
                                  }
                                }}
                                className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-1 transition-colors shadow-2xs"
                                title="Reiniciar todas as réplicas deste componente"
                              >
                                <RotateCw className="w-3 h-3" />
                                <span>Reiniciar Todas</span>
                              </button>

                              {/* Batch start / stop for all replicas in this component */}
                              {group.containers.some((c) => c.status === 'running' || c.state === 'running') ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    for (const c of group.containers) {
                                      await handleContainerPower(c.name, 'stop');
                                    }
                                  }}
                                  className="px-2.5 py-1 text-xs font-semibold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg flex items-center gap-1 transition-colors shadow-2xs"
                                  title="Parar todas as réplicas deste componente"
                                >
                                  <Square className="w-3 h-3 fill-current" />
                                  <span>Parar Todas</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    for (const c of group.containers) {
                                      await handleContainerPower(c.name, 'start');
                                    }
                                  }}
                                  className="px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg flex items-center gap-1 transition-colors shadow-2xs"
                                  title="Iniciar todas as réplicas deste componente"
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                  <span>Iniciar Todas</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Sub-barra: Configurações no nível da Instância (Domínios, Porta Pública Host, Variáveis .env) */}
                          <div className="bg-white px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                            {/* Left: Domínios Vinculados à Instância */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                <Globe className="w-3.5 h-3.5 text-slate-400" />
                                <span>Domínios:</span>
                              </span>

                              {compDomains.length === 0 ? (
                                <span className="text-[11px] text-slate-400 italic">Nenhum domínio vinculado</span>
                              ) : (
                                compDomains.map((d) => {
                                  const isLb = d.targetContainer?.startsWith('[');
                                  return (
                                    <span
                                      key={d.id}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${
                                        isLb
                                          ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      }`}
                                      title={
                                        isLb
                                          ? `Traefik Load Balancer: tráfego distribuído automaticamente entre as réplicas`
                                          : `Traefik: ${d.domainName} ➔ ${group.serviceName}:${d.targetPort || detectedCompPort}`
                                      }
                                    >
                                      {isLb ? (
                                        <Scale className="w-2.5 h-2.5 text-indigo-600" />
                                      ) : (
                                        <Globe className="w-2.5 h-2.5 text-emerald-600" />
                                      )}
                                      <span>{d.domainName}</span>
                                    </span>
                                  );
                                })
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenQuickDomainModalForComponent(
                                    group.serviceName,
                                    detectedCompPort,
                                    group.containers
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors shadow-2xs"
                                title={`Vincular novo domínio à instância "${group.serviceName}" com balanceamento entre as réplicas`}
                              >
                                <Plus className="w-2.5 h-2.5" />
                                <span>Associar Domínio</span>
                              </button>
                            </div>

                            {/* Right: Porta Pública Host, Variáveis .env e Papel de Roteador */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {!isPrimaryComponent && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSetPrimary(group.containers[0]?.name || group.serviceName, detectedCompPort)
                                  }
                                  className="px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded transition-colors"
                                  title="Definir esta instância como Roteador Principal da stack"
                                >
                                  Tornar Principal
                                </button>
                              )}

                              {/* Porta Pública Host */}
                              {publishedHostPort ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPortModal(group.serviceName, detectedCompPort, publishedHostPort)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 transition-colors shadow-2xs"
                                  title="Clique para alterar ou remover a porta pública no host"
                                >
                                  <Network className="w-3 h-3 text-blue-600" />
                                  <span>Host: {publishedHostPort} ➔ :{detectedCompPort}/tcp</span>
                                  <Pencil className="w-2.5 h-2.5 text-blue-600 ml-0.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPortModal(group.serviceName, detectedCompPort)}
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors shadow-2xs"
                                  title="Publicar uma porta pública no host para acesso externo direto (ex: banco de dados, redis)"
                                >
                                  <Network className="w-3 h-3 text-slate-500" />
                                  <span>Publicar Porta Host</span>
                                </button>
                              )}

                              {/* Variáveis de Ambiente da Instância */}
                              <button
                                type="button"
                                onClick={() => handleOpenInstanceEnvModal(group.serviceName)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors shadow-2xs"
                                title={`Configurar variáveis de ambiente (.env) para toda a instância "${group.serviceName}"`}
                              >
                                <SlidersHorizontal className="w-3 h-3 text-purple-600" />
                                <span>Variáveis (.env)</span>
                              </button>
                            </div>
                          </div>

                          {/* Tabela de Réplicas (Execução/Containers da Instância) */}
                          {!isCollapsed && (
                            <table className="w-full text-left text-xs text-slate-600">
                              <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
                                <tr>
                                  <th className="px-4 py-2">Réplica & Nome</th>
                                  <th className="px-4 py-2">Status</th>
                                  <th className="px-4 py-2">Rede proxy-net</th>
                                  <th className="px-4 py-2">Porta Interna</th>
                                  <th className="px-4 py-2 text-right">Ações da Réplica</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {group.containers.map((c, idx) => {
                                  const isRunning = c.status === 'running' || c.state === 'running';
                                  const isOnProxyNet =
                                    c.isOnProxyNet || (c.networks && c.networks.includes('proxy-net'));
                                  const containerNum =
                                    c.labels?.['com.docker.compose.container-number'] || String(idx + 1);

                                  return (
                                    <tr
                                      key={c.id || c.name}
                                      className="hover:bg-slate-50/80 transition-colors"
                                    >
                                      {/* Replica Name & Indicator */}
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                          <span className="text-indigo-400 font-mono text-xs select-none">↳</span>
                                          <span className="font-mono font-bold text-slate-900">{c.name}</span>
                                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                            #{containerNum}
                                          </span>
                                        </div>
                                      </td>

                                      {/* Status */}
                                      <td className="px-4 py-3">
                                        <span
                                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                            isRunning
                                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                                          }`}
                                        >
                                          <span
                                            className={`w-1.5 h-1.5 rounded-full ${
                                              isRunning ? 'bg-emerald-500' : 'bg-rose-500'
                                            }`}
                                          />
                                          <span>{isRunning ? 'Executando' : 'Parado'}</span>
                                        </span>
                                      </td>

                                      {/* Proxy-Net Status */}
                                      <td className="px-4 py-3">
                                        {isOnProxyNet ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            <Check className="w-3 h-3 text-emerald-600" />
                                            <span>Conectado</span>
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => handleAttachNetwork(c.name)}
                                            disabled={containerActionLoading[c.name]}
                                            className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1 transition-colors"
                                            title="Conectar à rede proxy-net do Traefik"
                                          >
                                            <Network className="w-3 h-3 text-amber-600" />
                                            <span>Conectar</span>
                                          </button>
                                        )}
                                      </td>

                                      {/* Ports */}
                                      <td className="px-4 py-3 font-mono text-slate-600 text-xs">
                                        {c.ports && c.ports.length > 0 ? (
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            {c.ports.map((p, pIdx) => (
                                              <span
                                                key={pIdx}
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                                  p.publicPort
                                                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                }`}
                                                title={
                                                  p.publicPort
                                                    ? `Mapeamento Host: 0.0.0.0:${p.publicPort} ➔ ${p.privatePort}`
                                                    : `Porta Interna do Container: ${p.privatePort}/${p.type || 'tcp'}`
                                                }
                                              >
                                                {p.publicPort ? (
                                                  <span>{p.publicPort} ➔ {p.privatePort}/{p.type || 'tcp'}</span>
                                                ) : (
                                                  <span>:{p.privatePort}/{p.type || 'tcp'} (interna)</span>
                                                )}
                                              </span>
                                            ))}
                                          </div>
                                        ) : (c as any).detectedPort ? (
                                          <span
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200"
                                            title="Porta interna identificada no container"
                                          >
                                            :{(c as any).detectedPort}/tcp (interna)
                                          </span>
                                        ) : isPrimaryComponent ? (
                                          <span
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200"
                                            title="Porta interna configurada para o Traefik"
                                          >
                                            :{internalPort}/tcp (configurada)
                                          </span>
                                        ) : (
                                          <span className="text-slate-400 text-[11px]">-</span>
                                        )}
                                      </td>

                                      {/* Actions */}
                                      <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          {isRunning ? (
                                            <button
                                              type="button"
                                              onClick={() => handleContainerPower(c.name, 'stop')}
                                              disabled={containerActionLoading[c.name]}
                                              className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                              title={`Parar réplica ${c.name}`}
                                            >
                                              <Square className="w-3.5 h-3.5 fill-current text-rose-600" />
                                            </button>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => handleContainerPower(c.name, 'start')}
                                              disabled={containerActionLoading[c.name]}
                                              className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                              title={`Iniciar réplica ${c.name}`}
                                            >
                                              <Play className="w-3.5 h-3.5 fill-current text-emerald-600" />
                                            </button>
                                          )}

                                          <button
                                            type="button"
                                            onClick={() => handleContainerPower(c.name, 'restart')}
                                            disabled={containerActionLoading[c.name]}
                                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                                            title="Reiniciar esta réplica"
                                          >
                                            <RotateCw
                                              className={`w-3.5 h-3.5 ${
                                                containerActionLoading[c.name] ? 'animate-spin' : ''
                                              }`}
                                            />
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => setModalLogsContainer(c.name)}
                                            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                            title={`Abrir logs de ${c.name} em janela`}
                                          >
                                            <FileText className="w-3.5 h-3.5" />
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => setModalTerminalContainer(c.name)}
                                            className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                            title={`Abrir Terminal / SSH em ${c.name} em janela`}
                                          >
                                            <TerminalSquare className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                /* FLAT LIST TABLE VIEW */
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-semibold">
                      <tr>
                        <th className="px-4 py-3">Container & Serviço</th>
                        <th className="px-4 py-3">Roteamento HTTP Traefik</th>
                        <th className="px-4 py-3">Imagem Docker</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Rede proxy-net</th>
                        <th className="px-4 py-3">Portas Mapeadas</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {containersList.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                            {isLoadingContainers ? (
                              <div className="flex items-center justify-center gap-2">
                                <RotateCw className="w-4 h-4 animate-spin text-blue-600" />
                                <span>Carregando containers da stack...</span>
                              </div>
                            ) : (
                              <div>
                                <span>Nenhum container encontrado para este serviço.</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : (
                        containersList.map((c) => {
                          const isPrimary = c.name === containerName || c.isPrimary;
                          const isRunning = c.status === 'running' || c.state === 'running';
                          const isOnProxyNet = c.isOnProxyNet || (c.networks && c.networks.includes('proxy-net'));

                          return (
                            <tr key={c.id || c.name} className={`hover:bg-slate-50/70 transition-colors ${isPrimary ? 'bg-blue-50/30' : ''}`}>
                              {/* Container & Compose Service */}
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-slate-900">{c.name}</span>
                                  {c.composeService && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                      {c.composeService}
                                    </span>
                                  )}
                                </div>
                                {c.isManuallyLinked && (
                                  <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded font-medium mt-0.5 inline-block border border-amber-200">
                                    Vinculado manualmente
                                  </span>
                                )}
                              </td>

                              {/* Routing role & Associated Domains */}
                              <td className="px-4 py-3.5">
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {isPrimary ? (
                                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 shadow-2xs">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                                        <span>Principal (:{internalPort})</span>
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const samplePort = c.ports?.find((p) => p.privatePort)?.privatePort || internalPort;
                                          handleSetPrimary(c.name, samplePort);
                                        }}
                                        className="px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded transition-colors"
                                        title="Definir este container como receptor padrão de domínios sem container específico"
                                      >
                                        Tornar Principal
                                      </button>
                                    )}
                                  </div>

                                  {/* Domains explicitly linked to this container + Add Domain Button */}
                                  <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                    {serviceDomains
                                      .filter((d) => {
                                        if (!d.targetContainer) return c.name === containerName;
                                        if (d.targetContainer.startsWith('[')) {
                                          return d.targetContainer.includes(`"${c.name}"`);
                                        }
                                        return d.targetContainer === c.name;
                                      })
                                      .map((d) => {
                                        const isLb = d.targetContainer?.startsWith('[');
                                        return (
                                          <span
                                            key={d.id}
                                            className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold border ${
                                              isLb
                                                ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                            }`}
                                            title={
                                              isLb
                                                ? `Traefik Load Balancer: ${d.domainName}`
                                                : `Traefik: ${d.domainName} ➔ ${c.name}:${d.targetPort || internalPort}`
                                            }
                                          >
                                            {isLb ? (
                                              <Scale className="w-2.5 h-2.5 text-indigo-600" />
                                            ) : (
                                              <Globe className="w-2.5 h-2.5 text-emerald-600" />
                                            )}
                                            <span>{d.domainName}</span>
                                          </span>
                                        );
                                      })}

                                    <button
                                      type="button"
                                      onClick={() => handleOpenQuickDomainModal(c)}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors shadow-2xs"
                                      title={`Vincular novo domínio diretamente a este container (${c.name})`}
                                    >
                                      <Plus className="w-2.5 h-2.5" />
                                      <span>Associar Domínio</span>
                                    </button>
                                  </div>
                                </div>
                              </td>

                              {/* Image */}
                              <td className="px-4 py-3.5 font-mono text-slate-700 text-xs">
                                <span className="truncate max-w-[200px] block" title={c.image}>
                                  {c.image}
                                </span>
                              </td>

                              {/* Status */}
                              <td className="px-4 py-3.5">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                    isRunning
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                                  }`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                  <span>{isRunning ? 'Executando' : 'Parado'}</span>
                                </span>
                              </td>

                              {/* Proxy-Net Status */}
                              <td className="px-4 py-3.5">
                                {isOnProxyNet ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span>Conectado</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleAttachNetwork(c.name)}
                                    disabled={containerActionLoading[c.name]}
                                    className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1 transition-colors"
                                    title="Conectar à rede proxy-net do Traefik"
                                  >
                                    <Network className="w-3 h-3 text-amber-600" />
                                    <span>Conectar</span>
                                  </button>
                                )}
                              </td>

                              {/* Ports */}
                              <td className="px-4 py-3.5 font-mono text-slate-600 text-xs">
                                {c.ports && c.ports.length > 0 ? (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {c.ports.map((p, idx) => (
                                      <span key={idx} className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded text-[10px]">
                                        {p.publicPort ? `${p.publicPort}->` : ''}{p.privatePort}/{p.type}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[11px]">-</span>
                                )}
                              </td>

                              {/* Actions */}
                              <td className="px-4 py-3.5 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {isRunning ? (
                                    <button
                                      type="button"
                                      onClick={() => handleContainerPower(c.name, 'stop')}
                                      disabled={containerActionLoading[c.name]}
                                      className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                      title={`Parar réplica ${c.name}`}
                                    >
                                      <Square className="w-3.5 h-3.5 fill-current text-rose-600" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleContainerPower(c.name, 'start')}
                                      disabled={containerActionLoading[c.name]}
                                      className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                      title={`Iniciar réplica ${c.name}`}
                                    >
                                      <Play className="w-3.5 h-3.5 fill-current text-emerald-600" />
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleContainerPower(c.name, 'restart')}
                                    disabled={containerActionLoading[c.name]}
                                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                                    title="Reiniciar este container"
                                  >
                                    <RotateCw className={`w-3.5 h-3.5 ${containerActionLoading[c.name] ? 'animate-spin' : ''}`} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setModalLogsContainer(c.name)}
                                    className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title={`Abrir logs de ${c.name} em janela`}
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setModalTerminalContainer(c.name)}
                                    className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                    title={`Abrir Terminal / SSH em ${c.name} em janela`}
                                  >
                                    <TerminalSquare className="w-3.5 h-3.5" />
                                  </button>

                                  {c.isManuallyLinked && (
                                    <button
                                      type="button"
                                      onClick={() => handleUnlinkContainer(c.name)}
                                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                      title="Desvincular da stack"
                                    >
                                      <Unlink className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 1: VARIÁVEIS DE AMBIENTE (.ENV) */}
          {activeTab === 'env' && (
            <div className="space-y-6">
              {/* Header and Mode switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span>Variáveis de Ambiente do Container</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure chaves, credenciais e variáveis injetadas em tempo de execução no container Docker.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Preset inserts */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                    <button
                      onClick={() => handleInsertPreset('common')}
                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-white hover:shadow-xs rounded transition-all"
                      title="Inserir PORT, NODE_ENV, TZ"
                    >
                      + Comuns
                    </button>
                    <button
                      onClick={() => handleInsertPreset('db_postgres')}
                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-white hover:shadow-xs rounded transition-all"
                      title="Inserir DATABASE_URL Postgres"
                    >
                      + Postgres
                    </button>
                    <button
                      onClick={() => handleInsertPreset('redis')}
                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-white hover:shadow-xs rounded transition-all"
                      title="Inserir REDIS_URL"
                    >
                      + Redis
                    </button>
                  </div>

                  {/* Visual vs Raw Editor Toggle */}
                  <div className="flex items-center bg-slate-200 p-0.5 rounded-lg">
                    <button
                      onClick={() => setEnvViewMode('visual')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                        envViewMode === 'visual'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Tabela Visual
                    </button>
                    <button
                      onClick={() => setEnvViewMode('raw')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                        envViewMode === 'raw'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Arquivo .env (Texto)
                    </button>
                  </div>

                  {/* Copy, Export & Import */}
                  <button
                    onClick={() => handleCopyClipboard(rawEnv, '.env')}
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded border border-slate-200 transition-colors"
                    title="Copiar todas as variáveis"
                  >
                    {copiedKey === '.env' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={handleExportEnv}
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded border border-slate-200 transition-colors"
                    title="Baixar arquivo .env"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  <label
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded border border-slate-200 transition-colors cursor-pointer"
                    title="Importar de arquivo .env local"
                  >
                    <Upload className="w-4 h-4" />
                    <input type="file" accept=".env,text/plain" onChange={handleImportEnv} className="hidden" />
                  </label>
                </div>
              </div>

              {/* Visual Mode */}
              {envViewMode === 'visual' && (
                <div className="space-y-4">
                  {/* Toolbar */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <input
                        type="text"
                        placeholder="Filtrar variáveis por chave ou valor..."
                        value={envFilter}
                        onChange={(e) => setEnvFilter(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    <button
                      onClick={handleAddEnvRow}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Variável</span>
                    </button>
                  </div>

                  {/* Variables Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="px-4 py-2.5 w-5/12">Chave (KEY)</th>
                          <th className="px-4 py-2.5 w-6/12">Valor (VALUE)</th>
                          <th className="px-4 py-2.5 w-1/12 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white font-mono">
                        {filteredEnvRows.length > 0 ? (
                          filteredEnvRows.map((row, idx) => {
                            const isRevealed = visibleSecrets[idx] || false;
                            return (
                              <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-4 py-2">
                                  <input
                                    type="text"
                                    value={row.key}
                                    onChange={(e) => handleUpdateEnvRow(idx, e.target.value, row.value)}
                                    placeholder="NOME_DA_VARIAVEL"
                                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase text-xs"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <div className="relative flex items-center">
                                    <input
                                      type={row.isSecret && !isRevealed ? 'password' : 'text'}
                                      value={row.value}
                                      onChange={(e) => handleUpdateEnvRow(idx, row.key, e.target.value)}
                                      placeholder="valor_da_variavel"
                                      className="w-full pr-8 pl-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                                    />
                                    {row.isSecret && (
                                      <button
                                        type="button"
                                        onClick={() => toggleSecret(idx)}
                                        className="absolute right-2 text-slate-400 hover:text-slate-700"
                                        title={isRevealed ? 'Ocultar segredo' : 'Exibir segredo'}
                                      >
                                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={() => handleCopyClipboard(`${row.key}=${row.value}`, row.key)}
                                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                                      title="Copiar linha"
                                    >
                                      {copiedKey === row.key ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                    <button
                                      onClick={() => handleRemoveEnvRow(idx)}
                                      className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                                      title="Remover variável"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                              {envFilter
                                ? 'Nenhuma variável encontrada para este filtro.'
                                : 'Nenhuma variável de ambiente definida. Clique em "Adicionar Variável" ou utilize os presets.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Raw Editor Mode */}
              {envViewMode === 'raw' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Insira uma variável por linha no formato <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600">CHAVE=VALOR</code>. Linhas iniciando com <code className="bg-slate-100 px-1 py-0.5 rounded">#</code> são comentários.
                    </span>
                    <span className="font-mono">{rawEnv.split('\n').filter(Boolean).length} linhas</span>
                  </div>

                  <div className="relative rounded-xl border border-slate-700 bg-slate-900 p-4 font-mono text-xs shadow-inner">
                    <textarea
                      value={rawEnv}
                      onChange={(e) => setRawEnv(e.target.value)}
                      rows={14}
                      placeholder={`# Configuração de Ambiente\nPORT=3000\nNODE_ENV=production\nDATABASE_URL=postgresql://user:pass@host:5432/db`}
                      className="w-full bg-transparent text-emerald-400 placeholder:text-slate-600 focus:outline-none resize-y font-mono leading-relaxed selection:bg-blue-600 selection:text-white"
                      spellCheck={false}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GERAL & ROTEAMENTO */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Server className="w-4 h-4 text-blue-600" />
                  <span>Configurações Básicas do Serviço</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Identificação do serviço, nome do container Docker e porta interna da aplicação.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nome de Exibição
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: API Backend Principal"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Nome amigável exibido no painel de controle.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nome do Container Docker
                  </label>
                  <input
                    type="text"
                    value={containerName}
                    onChange={(e) => setContainerName(e.target.value)}
                    placeholder="Ex: api-backend"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Identificador de rede Docker usado pelo Traefik (<code className="font-mono text-blue-600">{containerName || 'container'}:{internalPort}</code>).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Porta Interna da Aplicação
                  </label>
                  <input
                    type="number"
                    value={internalPort}
                    onChange={(e) => setInternalPort(Number(e.target.value))}
                    min={1}
                    max={65535}
                    placeholder="Ex: 3000, 8080, 5432"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Porta exposta pelo container na qual a aplicação escuta requisições HTTP/TCP.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Imagem Docker (Registry / Hub)
                  </label>
                  <input
                    type="text"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    placeholder="Ex: node:20-alpine, postgres:16-alpine"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Imagem utilizada para instanciar o container.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notas & Descrição Operacional
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Observações sobre a finalidade deste serviço, responsáveis ou regras específicas..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Status & Routing flags */}
              <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    id="isActiveCheckbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                  />
                  <label htmlFor="isActiveCheckbox" className="cursor-pointer select-none">
                    <span className="text-xs font-bold text-slate-900 block">Roteamento Traefik Habilitado</span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Quando ativo, o Traefik encaminha requisições dos domínios mapeados para este container.
                    </span>
                  </label>
                </div>

                <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    id="isDefaultCheckbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                  />
                  <label htmlFor="isDefaultCheckbox" className="cursor-pointer select-none">
                    <span className="text-xs font-bold text-slate-900 block">Serviço Padrão (Catch-All)</span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Recebe requisições de domínios ou subdomínios apontados para este servidor mas não cadastrados explicitamente.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DOMÍNIOS & TRAEFIK */}
          {activeTab === 'domains' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span>Domínios Vinculados & Roteamento Traefik</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gerencie os domínios e subdomínios que encaminham tráfego para a porta interna deste container.
                </p>
              </div>

              {/* Traefik Live Rule Banner */}
              <div className="bg-slate-900 text-slate-200 rounded-xl p-4 border border-slate-800 font-mono text-xs shadow-inner">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5 font-sans font-semibold text-white">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Regras Dinâmicas do Traefik v3 para esta Stack
                  </span>
                  <span className="text-emerald-400 font-bold">Cloudflare SSL Full (strict)</span>
                </div>
                <div className="space-y-1.5">
                  {serviceDomains.length === 0 ? (
                    <div className="text-slate-500">
                      Nenhum domínio vinculado no momento (Roteamento inativo no Traefik).
                    </div>
                  ) : (
                    serviceDomains.map((dom) => {
                      let isLb = false;
                      let lbTargets: Array<{ container: string; port: number }> = [];
                      if (dom.targetContainer && dom.targetContainer.startsWith('[')) {
                        try {
                          lbTargets = JSON.parse(dom.targetContainer);
                          isLb = true;
                        } catch (e) {
                          isLb = false;
                        }
                      }

                      if (isLb && lbTargets.length > 0) {
                        return (
                          <div key={dom.id} className="flex items-center gap-2 flex-wrap">
                            <span className="text-slate-500">Host(</span>
                            <span className="text-emerald-300 font-bold">`{dom.domainName}`</span>
                            <span className="text-slate-500">) ➔</span>
                            <span className="text-indigo-400 font-semibold flex items-center gap-1">
                              <Scale className="w-3 h-3" />
                              LoadBalancer [{lbTargets.map((t) => `${t.container}:${t.port}`).join(', ')}]
                            </span>
                            {dom.healthCheckPath && (
                              <span className="text-emerald-400 text-[10px]">
                                (HealthCheck: {dom.healthCheckPath} @ 5s)
                              </span>
                            )}
                            <span className="text-blue-400 text-[10px]">({network || 'proxy-net'})</span>
                          </div>
                        );
                      }

                      const cTarget = dom.targetContainer || containerName;
                      const pTarget = dom.targetPort || internalPort;
                      return (
                        <div key={dom.id} className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-500">Host(</span>
                          <span className="text-emerald-300 font-bold">`{dom.domainName}`</span>
                          <span className="text-slate-500">) ➔</span>
                          <span className="text-amber-300 font-semibold">http://{cTarget}:{pTarget}</span>
                          {dom.healthCheckPath && (
                            <span className="text-emerald-400 text-[10px]">
                              (HealthCheck: {dom.healthCheckPath})
                            </span>
                          )}
                          <span className="text-blue-400 text-[10px]">({network || 'proxy-net'})</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Quick Link New Domain with Mode Selector (Single vs Load Balancer) */}
              <form onSubmit={handleLinkDomain} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-blue-600" />
                    <span>Configurar Domínio & Roteamento Traefik</span>
                  </div>

                  {/* Mode Selector */}
                  <div className="inline-flex p-0.5 bg-slate-200/80 rounded-lg text-xs font-medium self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setDomainRoutingMode('single')}
                      className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
                        domainRoutingMode === 'single'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Server className="w-3 h-3" />
                      <span>Container Único</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDomainRoutingMode('load_balancer');
                        if (lbSelectedContainers.length === 0) {
                          if (containersList.length > 0) {
                            const primary = containersList.find((c) => c.isPrimary) || containersList[0];
                            setLbSelectedContainers([primary.name]);
                          } else {
                            setLbSelectedContainers([containerName]);
                          }
                        }
                      }}
                      className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
                        domainRoutingMode === 'load_balancer'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Scale className="w-3 h-3" />
                      <span>⚖️ Balanceamento de Carga (Load Balancer)</span>
                    </button>
                  </div>
                </div>

                {domainRoutingMode === 'single' ? (
                  /* SINGLE CONTAINER MODE */
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    {/* Domain Input */}
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Nome do Domínio
                      </label>
                      <input
                        type="text"
                        required
                        value={newDomainInput}
                        onChange={(e) => setNewDomainInput(e.target.value)}
                        placeholder={`ex: api.${mainDomain || 'bla.com.br'} ou app.${mainDomain || 'bla.com.br'}`}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      />
                    </div>

                    {/* Container Selector */}
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Container de Destino
                      </label>
                      <select
                        value={selectedDomainContainer}
                        onChange={(e) => {
                          const cName = e.target.value;
                          setSelectedDomainContainer(cName);
                          const chosen = containersList.find((c) => c.name === cName);
                          const p = chosen?.ports?.find((port) => port.privatePort)?.privatePort;
                          if (p) setSelectedDomainPort(p);
                          else if (cName === containerName) setSelectedDomainPort(internalPort);
                        }}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      >
                        <option value={containerName}>
                          ⭐ Principal ({containerName})
                        </option>
                        {containersList
                          .filter((c) => c.name !== containerName)
                          .map((c) => (
                            <option key={c.id || c.name} value={c.name}>
                              {c.name} {c.composeService ? `(${c.composeService})` : ''}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Internal Port Input */}
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Porta
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        max="65535"
                        value={selectedDomainPort}
                        onChange={(e) => setSelectedDomainPort(Number(e.target.value))}
                        className="w-full px-2 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-center font-bold"
                      />
                    </div>

                    {/* Submit Button */}
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={isLinkingDomain || !newDomainInput.trim()}
                        className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isLinkingDomain ? 'Vinculando...' : 'Vincular'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* LOAD BALANCER MODE */
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      {/* Domain Input */}
                      <div className="sm:col-span-6">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Nome do Domínio para o Balanceador
                        </label>
                        <input
                          type="text"
                          required
                          value={newDomainInput}
                          onChange={(e) => setNewDomainInput(e.target.value)}
                          placeholder={`ex: lb.${mainDomain || 'bla.com.br'} ou api.${mainDomain || 'bla.com.br'}`}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                        />
                      </div>

                      {/* Default Port */}
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Porta dos Alvos
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          max="65535"
                          value={selectedDomainPort}
                          onChange={(e) => setSelectedDomainPort(Number(e.target.value))}
                          className="w-full px-2 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-center font-bold"
                        />
                      </div>

                      {/* Health Check Path */}
                      <div className="sm:col-span-4">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                            <HeartPulse className="w-3 h-3 text-rose-500" />
                            <span>Rota de Health Check</span>
                          </label>
                          <span className="text-[10px] text-slate-400">Opcional</span>
                        </div>
                        <input
                          type="text"
                          value={lbHealthCheckPath}
                          onChange={(e) => setLbHealthCheckPath(e.target.value)}
                          placeholder="Ex: /health, / (vazio = desativado)"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className="text-[10px] text-slate-400">Atalhos:</span>
                          <button
                            type="button"
                            onClick={() => setLbHealthCheckPath('/')}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                              lbHealthCheckPath === '/'
                                ? 'bg-indigo-100 text-indigo-700 font-bold border border-indigo-200'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            / (Raiz - Recomendado)
                          </button>
                          <button
                            type="button"
                            onClick={() => setLbHealthCheckPath('/health')}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                              lbHealthCheckPath === '/health'
                                ? 'bg-indigo-100 text-indigo-700 font-bold border border-indigo-200'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            /health
                          </button>
                          <button
                            type="button"
                            onClick={() => setLbHealthCheckPath('')}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                              !lbHealthCheckPath
                                ? 'bg-indigo-100 text-indigo-700 font-bold border border-indigo-200'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Desativado
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Containers Checklist */}
                    <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-100">
                        <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                          <Boxes className="w-3.5 h-3.5 text-blue-600" />
                          Selecione os Containers da Stack para compor o Pool do Load Balancer:
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const all = (containersList.length > 0 ? containersList.map((c) => c.name) : [containerName]);
                              setLbSelectedContainers(all);
                            }}
                            className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold hover:underline"
                          >
                            Selecionar Todos
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => setLbSelectedContainers([])}
                            className="text-[11px] text-slate-500 hover:text-slate-700 font-semibold hover:underline"
                          >
                            Limpar
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                        {(containersList.length > 0
                          ? containersList
                          : [{ id: 'main', name: containerName, composeService: 'principal', state: 'running' }]
                        ).map((c) => {
                          const isChecked = lbSelectedContainers.includes(c.name);
                          return (
                            <label
                              key={c.id || c.name}
                              className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                                isChecked
                                  ? 'bg-blue-50/80 border-blue-300 text-blue-900 font-semibold shadow-2xs'
                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setLbSelectedContainers((prev) =>
                                    prev.includes(c.name) ? prev.filter((n) => n !== c.name) : [...prev, c.name]
                                  );
                                }}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-mono text-[11px]">{c.name}</div>
                                {c.composeService && (
                                  <div className="text-[10px] text-slate-400 font-normal">
                                    serviço: {c.composeService}
                                  </div>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-[11px] text-slate-500">
                        <div className="flex items-center gap-1.5 text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-md border border-indigo-100">
                          <Scale className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>
                            Round-Robin entre <strong>{lbSelectedContainers.length} réplica(s)</strong>.
                            {lbHealthCheckPath.trim() ? (
                              <> Health check ativo em <code className="font-bold text-rose-600">{lbHealthCheckPath.trim()}</code> com failover a cada 5s.</>
                            ) : (
                              <> Balanceamento direto sem probe HTTP (ideal para apps sem rota /health).</>
                            )}
                          </span>
                        </div>

                        <button
                          type="submit"
                          disabled={isLinkingDomain || !newDomainInput.trim() || lbSelectedContainers.length === 0}
                          className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs shrink-0"
                        >
                          <Scale className="w-3.5 h-3.5" />
                          <span>{isLinkingDomain ? 'Configurando...' : 'Criar Load Balancer Traefik'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </form>

              {/* Domains list */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">Domínio</th>
                      <th className="px-4 py-2.5">Destino na Stack (Container / Réplicas)</th>
                      <th className="px-4 py-2.5">Status SSL</th>
                      <th className="px-4 py-2.5">Status Rota</th>
                      <th className="px-4 py-2.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {serviceDomains.length > 0 ? (
                      serviceDomains.map((dom) => {
                        let isLb = false;
                        let lbTargets: Array<{ container: string; port: number }> = [];
                        if (dom.targetContainer && dom.targetContainer.startsWith('[')) {
                          try {
                            lbTargets = JSON.parse(dom.targetContainer);
                            isLb = true;
                          } catch (e) {
                            isLb = false;
                          }
                        }

                        const cTarget = dom.targetContainer || containerName;
                        const pTarget = dom.targetPort || internalPort;
                        const isMainContainer = cTarget === containerName;

                        return (
                          <tr key={dom.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3 font-semibold text-slate-900 flex items-center gap-2">
                              <Globe className="w-3.5 h-3.5 text-blue-600" />
                              <span>{dom.domainName}</span>
                              <a
                                href={`https://${dom.domainName}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-400 hover:text-blue-600 ml-1"
                                title="Abrir URL"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </td>

                            <td className="px-4 py-3">
                              {isLb ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                      <Scale className="w-3 h-3 text-indigo-600" />
                                      <span>Load Balancer ({lbTargets.length} réplicas)</span>
                                    </span>
                                    {dom.healthCheckPath && (
                                      <span
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                        title={`Health Check a cada 5s: ${dom.healthCheckPath}`}
                                      >
                                        <HeartPulse className="w-2.5 h-2.5 text-emerald-600" />
                                        <span>{dom.healthCheckPath}</span>
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {lbTargets.map((t, idx) => (
                                      <span
                                        key={idx}
                                        className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200"
                                      >
                                        {t.container}:{t.port}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono font-bold text-slate-800">{cTarget}</span>
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    :{pTarget}
                                  </span>
                                  {isMainContainer && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                                      Principal
                                    </span>
                                  )}
                                  {dom.healthCheckPath && (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      title={`Health Check: ${dom.healthCheckPath}`}
                                    >
                                      <HeartPulse className="w-2.5 h-2.5 text-emerald-600" />
                                      <span>{dom.healthCheckPath}</span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                <span>Cloudflare Proxied</span>
                              </span>
                            </td>

                            <td className="px-4 py-3">
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                                  dom.isActive
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {dom.isActive ? 'Roteamento Ativo' : 'Pausado'}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleUnlinkDomain(dom.id, dom.domainName)}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded"
                                title="Desvincular este domínio deste serviço"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                          Nenhum domínio vinculado a este serviço. Adicione um domínio acima para rotear tráfego via Traefik.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: ORIGEM & CI/CD GIT */}
          {activeTab === 'build' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-blue-600" />
                  <span>Origem da Aplicação & Pipeline de Build</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Escolha se o container roda uma imagem pré-construída de um Registry ou se constrói diretamente do GitHub (Push-to-Deploy).
                </p>
              </div>

              {/* Source Switcher */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setSourceType('IMAGE')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    sourceType === 'IMAGE'
                      ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                    <Server className="w-4 h-4 text-blue-600" />
                    <span>Docker Registry / Docker Hub</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Utiliza uma imagem pronta oficial ou privada (ex: <code className="font-mono">postgres:16-alpine</code>, <code className="font-mono">redis:7</code>).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceType('GITHUB')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    sourceType === 'GITHUB'
                      ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
                    <GitBranch className="w-4 h-4 text-blue-600" />
                    <span>Repositório GitHub (Push-to-Deploy)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Clona o repositório, constrói a imagem via Dockerfile e executa deploy automático a cada push.
                  </p>
                </button>
              </div>

              {/* GitHub Details */}
              {sourceType === 'GITHUB' ? (
                <div className="space-y-6 pt-4 border-t border-slate-100">
                  {(() => {
                    const currentBuildStatus = liveBuildStatus || service.buildStatus;
                    const isBuildingNow =
                      currentBuildStatus === 'cloning' ||
                      currentBuildStatus === 'building' ||
                      (isTriggeringRebuild && currentBuildStatus !== 'success' && currentBuildStatus !== 'failed');

                    return (
                      <>
                        {/* Status & Rebuild Action Bar */}
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-white border border-slate-200 rounded-lg shadow-2xs">
                              {isBuildingNow ? (
                                <RotateCw className="w-5 h-5 text-blue-600 animate-spin" />
                              ) : currentBuildStatus === 'success' ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                              ) : currentBuildStatus === 'failed' ? (
                                <AlertCircle className="w-5 h-5 text-rose-600" />
                              ) : (
                                <GitBranch className="w-5 h-5 text-slate-500" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">Status de Compilação:</span>
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                    currentBuildStatus === 'cloning'
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                                      : currentBuildStatus === 'building'
                                      ? 'bg-blue-100 text-blue-800 border border-blue-200 animate-pulse'
                                      : currentBuildStatus === 'success'
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : currentBuildStatus === 'failed'
                                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                                  }`}
                                >
                                  {currentBuildStatus === 'cloning'
                                    ? 'Clonando repositório...'
                                    : currentBuildStatus === 'building'
                                    ? 'Construindo imagem...'
                                    : currentBuildStatus === 'success'
                                    ? 'Concluído com Sucesso'
                                    : currentBuildStatus === 'failed'
                                    ? 'Falha na Compilação'
                                    : 'Pronto / Aguardando'}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {gitRepoUrl ? (
                                  <>
                                    Repositório: <code className="font-mono text-slate-700">{gitRepoUrl}</code> (branch <code className="font-mono text-slate-700">{gitBranch || 'main'}</code>)
                                  </>
                                ) : (
                                  'Configure a URL do repositório abaixo para iniciar o pipeline.'
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => {
                                fetchBuildsHistory();
                                if (onRefreshData) onRefreshData();
                              }}
                              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-200 rounded-lg transition-colors"
                              title="Atualizar Status & Logs"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={handleTriggerManualBuild}
                              disabled={isBuildingNow || !gitRepoUrl.trim()}
                              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                            >
                              <RotateCw
                                className={`w-3.5 h-3.5 ${isBuildingNow ? 'animate-spin' : ''}`}
                              />
                              <span>{isBuildingNow ? 'Compilando...' : 'Reconstruir do GitHub'}</span>
                            </button>
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {/* Git Configuration Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        URL do Repositório GitHub
                      </label>
                      <input
                        type="text"
                        value={gitRepoUrl}
                        onChange={(e) => setGitRepoUrl(e.target.value)}
                        placeholder="https://github.com/usuario/meu-projeto.git"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        URL HTTPS pública ou privada do repositório no GitHub.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Branch de Deploy
                      </label>
                      <input
                        type="text"
                        value={gitBranch}
                        onChange={(e) => setGitBranch(e.target.value)}
                        placeholder="main ou master"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Ramo monitorado para deploys automáticos.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {dockerfilePath && (dockerfilePath.endsWith('.yml') || dockerfilePath.endsWith('.yaml') || dockerfilePath.includes('compose'))
                          ? 'Caminho do Docker Compose'
                          : 'Caminho do Dockerfile'}
                      </label>
                      <input
                        type="text"
                        value={dockerfilePath}
                        onChange={(e) => setDockerfilePath(e.target.value)}
                        placeholder="docker-compose.yml ou Dockerfile"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        {dockerfilePath && (dockerfilePath.endsWith('.yml') || dockerfilePath.endsWith('.yaml') || dockerfilePath.includes('compose'))
                          ? 'Caminho relativo do arquivo Docker Compose no repositório.'
                          : 'Caminho relativo do arquivo Dockerfile (padrão: Dockerfile).'}
                      </p>
                    </div>

                    {!dockerfilePath || (!dockerfilePath.endsWith('.yml') && !dockerfilePath.endsWith('.yaml') && !dockerfilePath.includes('compose')) ? (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Contexto do Build (Root Directory)
                        </label>
                        <input
                          type="text"
                          value={buildContext}
                          onChange={(e) => setBuildContext(e.target.value)}
                          placeholder=". ou apps/backend"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          Diretório enviado ao Docker daemon (útil para monorepos, padrão: <code className="font-mono">.</code>).
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {/* Git Authentication info */}
                  <div className="flex items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                      <Key className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-800 flex items-center gap-2">
                        <span>Autenticação Git Automática</span>
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full">
                          Ativa
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Utiliza automaticamente as credenciais da conta GitHub conectada em <span className="font-semibold text-slate-700">Configurações &gt; Integrações</span> para repositórios privados.
                      </p>
                    </div>
                  </div>

                  {/* Webhook integration panel */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        <span>Webhook do GitHub para Push-to-Deploy Automático</span>
                      </h3>
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full">
                        Event: push
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Configure este webhook no seu repositório GitHub em <strong>Settings &gt; Webhooks &gt; Add webhook</strong>:
                    </p>

                    <div className="space-y-3 font-mono text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-sans font-semibold block">Payload URL</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <input
                            type="text"
                            readOnly
                            value={`https://${mainDomain}/api/webhooks/github/${service.id}`}
                            className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded text-slate-800 text-xs select-all"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyClipboard(
                                `https://${mainDomain}/api/webhooks/github/${service.id}`,
                                'URL do Webhook'
                              )
                            }
                            className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700"
                            title="Copiar URL"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {service.webhookSecret && (
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-sans font-semibold block">Secret (Segredo HMAC)</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <input
                              type="text"
                              readOnly
                              value={service.webhookSecret}
                              className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded text-slate-800 text-xs select-all"
                            />
                            <button
                              type="button"
                              onClick={() => handleCopyClipboard(service.webhookSecret || '', 'Secret do Webhook')}
                              className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700"
                              title="Copiar Secret"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="text-[11px] font-sans text-slate-500 flex items-center gap-3 pt-1">
                        <span><strong>Content type:</strong> application/json</span>
                        <span>•</span>
                        <span><strong>SSL verification:</strong> Enable</span>
                      </div>
                    </div>
                  </div>

                  {/* Live Build Logs Terminal */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Terminal className="w-3.5 h-3.5 text-blue-600" />
                          <span>Terminal de Logs da Compilação</span>
                        </h4>

                        {/* Status Badge alongside title */}
                        {(() => {
                          const currentBuildStatus = liveBuildStatus || service.buildStatus;
                          const isBuildingNow =
                            currentBuildStatus === 'cloning' ||
                            currentBuildStatus === 'building' ||
                            (isTriggeringRebuild && currentBuildStatus !== 'success' && currentBuildStatus !== 'failed');

                          return (
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                currentBuildStatus === 'cloning'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                                  : currentBuildStatus === 'building'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200 animate-pulse'
                                  : currentBuildStatus === 'success'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : currentBuildStatus === 'failed'
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {isBuildingNow ? (
                                <RotateCw className="w-2.5 h-2.5 animate-spin" />
                              ) : null}
                              <span>
                                {currentBuildStatus === 'cloning'
                                  ? 'Clonando repositório...'
                                  : currentBuildStatus === 'building'
                                  ? 'Compilando...'
                                  : currentBuildStatus === 'success'
                                  ? 'Concluído com Sucesso'
                                  : currentBuildStatus === 'failed'
                                  ? 'Falha na Compilação'
                                  : 'Pronto / Aguardando'}
                              </span>
                            </span>
                          );
                        })()}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Quick Rebuild Action Button right next to logs */}
                        {(() => {
                          const currentBuildStatus = liveBuildStatus || service.buildStatus;
                          const isBuildingNow =
                            currentBuildStatus === 'cloning' ||
                            currentBuildStatus === 'building' ||
                            (isTriggeringRebuild && currentBuildStatus !== 'success' && currentBuildStatus !== 'failed');

                          return (
                            <button
                              type="button"
                              onClick={handleTriggerManualBuild}
                              disabled={isBuildingNow || !gitRepoUrl.trim()}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                            >
                              <RotateCw
                                className={`w-3 h-3 ${isBuildingNow ? 'animate-spin' : ''}`}
                              />
                              <span>{isBuildingNow ? 'Compilando...' : 'Reconstruir do GitHub'}</span>
                            </button>
                          );
                        })()}

                        <button
                          type="button"
                          onClick={() => handleCopyClipboard(liveBuildLogs || service.buildLogs || '', 'Logs de Build')}
                          disabled={!(liveBuildLogs || service.buildLogs)}
                          className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded flex items-center gap-1 disabled:opacity-40"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copiar Logs</span>
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-inner">
                      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                          <span className="font-mono text-slate-300 font-semibold ml-2">docker build output</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">
                          {gitBranch ? `branch: ${gitBranch}` : ''}
                        </span>
                      </div>
                      <pre className="p-4 text-emerald-400 font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto selection:bg-blue-600 selection:text-white">
                        {liveBuildLogs || service.buildLogs || 'Nenhum log de compilação disponível ainda. Dispare um build acima ou realize um commit na branch para ver a execução.'}
                      </pre>
                    </div>
                  </div>

                  {/* Builds History Table */}
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        <span>Histórico de Builds Recentes</span>
                        {buildsHistory.length > 0 && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono font-bold">
                            {buildsHistory.length}
                          </span>
                        )}
                      </h4>

                      <button
                        type="button"
                        onClick={fetchBuildsHistory}
                        disabled={isLoadingBuilds}
                        className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isLoadingBuilds ? 'animate-spin' : ''}`} />
                        <span>Atualizar</span>
                      </button>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2.5">Status</th>
                            <th className="px-4 py-2.5">Commit</th>
                            <th className="px-4 py-2.5">Origem</th>
                            <th className="px-4 py-2.5">Data/Hora</th>
                            <th className="px-4 py-2.5">Duração</th>
                            <th className="px-4 py-2.5 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                          {buildsHistory.length > 0 ? (
                            buildsHistory.map((b) => {
                              const started = b.startedAt ? new Date(b.startedAt) : null;
                              const finished = b.finishedAt ? new Date(b.finishedAt) : null;
                              let durationStr = '-';
                              if (started && finished) {
                                const diffSec = Math.round((finished.getTime() - started.getTime()) / 1000);
                                durationStr = diffSec >= 60 ? `${Math.floor(diffSec / 60)}m ${diffSec % 60}s` : `${diffSec}s`;
                              } else if (started && (b.status === 'building' || b.status === 'cloning')) {
                                durationStr = 'Em andamento...';
                              }

                              return (
                                <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-3">
                                    <span
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-sans ${
                                        b.status === 'success'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : b.status === 'failed'
                                          ? 'bg-rose-100 text-rose-800'
                                          : 'bg-blue-100 text-blue-800'
                                      }`}
                                    >
                                      {b.status === 'success' ? (
                                        <CheckCircle2 className="w-3 h-3" />
                                      ) : b.status === 'failed' ? (
                                        <AlertCircle className="w-3 h-3" />
                                      ) : (
                                        <RotateCw className="w-3 h-3 animate-spin" />
                                      )}
                                      <span className="capitalize">{b.status}</span>
                                    </span>
                                  </td>

                                  <td className="px-4 py-3 text-slate-800 font-sans max-w-xs truncate" title={b.gitCommit || '-'}>
                                    <div className="flex items-center gap-1 font-mono text-[11px] text-slate-700">
                                      <GitCommit className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                      <span className="truncate">{b.gitCommit || 'Manual Trigger'}</span>
                                    </div>
                                  </td>

                                  <td className="px-4 py-3 font-sans text-slate-600">
                                    <span className="capitalize text-[10px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                                      {b.trigger || 'manual'}
                                    </span>
                                  </td>

                                  <td className="px-4 py-3 text-slate-600">
                                    {started ? started.toLocaleString('pt-BR') : '-'}
                                  </td>

                                  <td className="px-4 py-3 text-slate-600">
                                    {durationStr}
                                  </td>

                                  <td className="px-4 py-3 text-right">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedBuildForLogs(b)}
                                      className="px-2 py-1 text-[11px] font-sans font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                    >
                                      Ver Logs
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-center text-slate-400 font-sans">
                                {isLoadingBuilds ? 'Carregando histórico de builds...' : 'Nenhum build registrado ainda neste serviço.'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pt-4 border-t border-slate-100">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tag da Imagem Docker
                  </label>
                  <input
                    type="text"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    placeholder="Ex: postgres:16-alpine, redis:7-alpine, nginx:alpine"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Qualquer imagem pública ou privada do Docker Hub ou do seu registry particular.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: DOCKER AVANÇADO */}
          {activeTab === 'docker' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-blue-600" />
                  <span>Configurações Avançadas de Execução Docker</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Política de reinicialização, rede, limites de recursos e volumes montados.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Política de Reinicialização (Restart Policy)
                  </label>
                  <select
                    value={restartPolicy}
                    onChange={(e) => setRestartPolicy(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="unless-stopped">unless-stopped (Recomendado - Reinicia exceto se parado manualmente)</option>
                    <option value="always">always (Sempre reinicia com o daemon)</option>
                    <option value="on-failure">on-failure (Reinicia apenas em caso de erro/crash)</option>
                    <option value="no">no (Não reinicia automaticamente)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rede Docker (Network)
                  </label>
                  <input
                    type="text"
                    value={network}
                    onChange={(e) => setNetwork(e.target.value)}
                    placeholder="proxy-net"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Rede bridge compartilhada com o Traefik para roteamento interno.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-blue-600" />
                    <span>Limite de Memória RAM (MB)</span>
                  </label>
                  <input
                    type="number"
                    value={memoryLimitMb}
                    onChange={(e) => setMemoryLimitMb(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Ex: 512, 1024, 2048 (Vazio = Ilimitado)"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-blue-600" />
                    <span>Limite de CPU (Cores)</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={cpuLimit}
                    onChange={(e) => setCpuLimit(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Ex: 0.5, 1.0, 2.0 (Vazio = Ilimitado)"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Comando / Entrypoint Customizado (Opcional)
                </label>
                <input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="Ex: npm run start:prod ou docker-entrypoint.sh postgres"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Volumes / Bind Mounts Persistentes
                </label>
                <textarea
                  value={volumes}
                  onChange={(e) => setVolumes(e.target.value)}
                  rows={3}
                  placeholder={`/var/data/${containerName}:/var/lib/postgresql/data\n./config:/app/config:ro`}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Um volume por linha no formato <code className="font-mono">caminho_host:caminho_container[:modo]</code>.
                </p>
              </div>
            </div>
          )}

          {/* TAB 6: INTERCONEXÃO DE REDE */}
          {activeTab === 'connection' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  <span>Strings de Conexão e Interconexão Docker</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Como outros containers e microsserviços na rede <code className="font-mono text-blue-600">proxy-net</code> podem se comunicar com este serviço.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Host Interno (Docker DNS)</span>
                  <div className="flex items-center justify-between bg-white px-3 py-2 rounded border border-slate-200 font-mono text-xs">
                    <span className="text-slate-900 font-semibold">{containerName}</span>
                    <button
                      onClick={() => handleCopyClipboard(containerName, 'Host DNS')}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Porta Interna</span>
                  <div className="flex items-center justify-between bg-white px-3 py-2 rounded border border-slate-200 font-mono text-xs">
                    <span className="text-slate-900 font-semibold">{internalPort}</span>
                    <button
                      onClick={() => handleCopyClipboard(String(internalPort), 'Porta Interna')}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Ready-to-use Connection URI */}
              <div className="bg-slate-900 text-slate-200 p-4 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="text-white font-sans font-bold">URI de Conexão Interna</span>
                  <span className="text-emerald-400">Rede: {network || 'proxy-net'}</span>
                </div>

                <div className="p-3 bg-slate-950 rounded border border-slate-800 text-emerald-400 break-all select-all">
                  {internalPort === 5432
                    ? `postgresql://usuario:senha@${containerName}:5432/banco`
                    : internalPort === 3306
                    ? `mysql://usuario:senha@${containerName}:3306/banco`
                    : internalPort === 27017
                    ? `mongodb://usuario:senha@${containerName}:27017/banco?authSource=admin`
                    : internalPort === 6379
                    ? `redis://:senha@${containerName}:6379`
                    : internalPort === 5672
                    ? `amqp://usuario:senha@${containerName}:5672`
                    : `http://${containerName}:${internalPort}`}
                </div>

                <p className="text-[11px] text-slate-400 font-sans">
                  Qualquer container associado à rede <code className="text-white">proxy-net</code> pode se conectar diretamente utilizando este endereço, sem precisar expor portas para a internet pública!
                </p>
              </div>
            </div>
          )}

          {/* TAB 8: TERMINAL & ACESSO SSH */}
          {activeTab === 'terminal' && (
            <div className="space-y-6">
              {/* Header and Shell selector */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                    <TerminalSquare className="w-4 h-4 text-emerald-600" />
                    <span>Terminal Web Interativo & Acesso SSH</span>
                    <span className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs font-bold">
                      {targetContainerFocus}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                      {isRunning ? 'Em Execução' : 'Parado'}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Execute comandos diretamente no container selecionado via Docker Engine Exec API ou conecte externamente via SSH.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Container Switcher for Terminal */}
                  {containersList.length > 1 && (
                    <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                      <Boxes className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="text-[11px] font-semibold text-slate-600">Alvo:</span>
                      <select
                        value={targetContainerFocus}
                        onChange={(e) => setTargetContainerFocus(e.target.value)}
                        className="text-xs font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-300 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                      >
                        {containersList.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} {c.composeService ? `(${c.composeService})` : ''} {c.name === containerName ? '⭐' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Shell Switcher */}
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs">
                    <button
                      onClick={() => setSelectedShell('/bin/sh')}
                      className={`px-2.5 py-1 rounded font-mono font-semibold transition-colors ${
                        selectedShell === '/bin/sh'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      /bin/sh
                    </button>
                    <button
                      onClick={() => setSelectedShell('/bin/bash')}
                      className={`px-2.5 py-1 rounded font-mono font-semibold transition-colors ${
                        selectedShell === '/bin/bash'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      /bin/bash
                    </button>
                  </div>

                  {/* Actions */}
                  <button
                    onClick={() => {
                      setTerminalHistory([]);
                      handleExecuteTerminalCommand('help');
                    }}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors"
                    title="Reiniciar Sessão e Exibir Ajuda"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reiniciar</span>
                  </button>

                  <button
                    onClick={() => setTerminalHistory([])}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors"
                    title="Limpar tela"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    <span>Limpar</span>
                  </button>

                  <button
                    onClick={handleDownloadTerminalLog}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors"
                    title="Baixar histórico em arquivo .log"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar Log</span>
                  </button>
                </div>
              </div>

              {/* Terminal Window */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-xl">
                {/* Terminal Window Title Bar */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
                      <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                      <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                    </div>
                    <span className="ml-2 font-mono text-slate-400 text-[11px] truncate">
                      root@{containerName}: /app ({selectedShell}) — docker exec -it
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-400">
                      Porta :{internalPort}
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                </div>

                {/* Terminal Output Area */}
                <div
                  onClick={() => terminalInputRef.current?.focus()}
                  className="p-4 font-mono text-xs overflow-y-auto max-h-[440px] min-h-[300px] space-y-3 cursor-text selection:bg-blue-600/30 selection:text-white"
                >
                  {terminalHistory.map((item) => (
                    <div key={item.id} className="space-y-1">
                      {item.command !== '# session-init' && (
                        <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                          <span className="text-emerald-400 font-semibold">
                            root@{containerName}:/app#
                          </span>
                          <span className="text-white font-bold">{item.command}</span>
                          <span className="text-[10px] text-slate-500 ml-auto flex items-center gap-1.5">
                            {item.exitCode === 0 ? (
                              <span className="text-emerald-500 text-[10px] bg-emerald-950/60 px-1 rounded border border-emerald-800/40">
                                0 OK
                              </span>
                            ) : (
                              <span className="text-rose-400 text-[10px] bg-rose-950/60 px-1 rounded border border-rose-800/40">
                                exit {item.exitCode}
                              </span>
                            )}
                            <span>{item.time}</span>
                          </span>
                        </div>
                      )}
                      <div className="whitespace-pre-wrap leading-relaxed pl-2 border-l border-slate-800/80">
                        {renderAnsiOutput(item.output)}
                      </div>
                    </div>
                  ))}

                  {/* Active Prompt Line */}
                  <div className="pt-2 flex items-center gap-2 text-slate-200">
                    <span className="text-emerald-400 font-semibold shrink-0 select-none">
                      root@{containerName}:/app#
                    </span>
                    <input
                      ref={terminalInputRef}
                      type="text"
                      value={currentCommand}
                      onChange={(e) => setCurrentCommand(e.target.value)}
                      onKeyDown={handleTerminalKeyDown}
                      disabled={isExecutingCommand}
                      placeholder={isExecutingCommand ? 'Aguardando resposta do container...' : 'Digite um comando e pressione Enter (ex: ls -la, env, ps aux)...'}
                      className="flex-1 bg-transparent border-none text-white focus:outline-none font-mono text-xs placeholder:text-slate-600"
                      autoFocus
                    />
                    <button
                      onClick={() => handleExecuteTerminalCommand()}
                      disabled={isExecutingCommand || !currentCommand.trim()}
                      className="px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded flex items-center gap-1 transition-colors disabled:opacity-30"
                      title="Executar comando (Enter)"
                    >
                      <CornerDownLeft className="w-3.5 h-3.5" />
                      <span>Enter</span>
                    </button>
                  </div>
                  <div ref={terminalBottomRef} />
                </div>
              </div>

              {/* Quick Command Shortcuts Toolbar */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>Atalhos de Comandos Rápidos</span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Clique em qualquer botão para executar instantaneamente no container
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleExecuteTerminalCommand('ls -la')}
                    className="px-2.5 py-1 text-xs font-mono font-medium bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg shadow-2xs transition-colors"
                  >
                    ls -la
                  </button>
                  <button
                    onClick={() => handleExecuteTerminalCommand('env')}
                    className="px-2.5 py-1 text-xs font-mono font-medium bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg shadow-2xs transition-colors"
                  >
                    env
                  </button>
                  <button
                    onClick={() => handleExecuteTerminalCommand('ps aux')}
                    className="px-2.5 py-1 text-xs font-mono font-medium bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg shadow-2xs transition-colors"
                  >
                    ps aux
                  </button>
                  <button
                    onClick={() => handleExecuteTerminalCommand('df -h')}
                    className="px-2.5 py-1 text-xs font-mono font-medium bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg shadow-2xs transition-colors"
                  >
                    df -h
                  </button>
                  <button
                    onClick={() => handleExecuteTerminalCommand('netstat -tuln')}
                    className="px-2.5 py-1 text-xs font-mono font-medium bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg shadow-2xs transition-colors"
                  >
                    netstat -tuln
                  </button>
                  <button
                    onClick={() => handleExecuteTerminalCommand('cat .env')}
                    className="px-2.5 py-1 text-xs font-mono font-medium bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg shadow-2xs transition-colors"
                  >
                    cat .env
                  </button>
                  <button
                    onClick={() => handleExecuteTerminalCommand('cat /etc/os-release')}
                    className="px-2.5 py-1 text-xs font-mono font-medium bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg shadow-2xs transition-colors"
                  >
                    cat /etc/os-release
                  </button>
                  <button
                    onClick={() => handleExecuteTerminalCommand('uptime')}
                    className="px-2.5 py-1 text-xs font-mono font-medium bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg shadow-2xs transition-colors"
                  >
                    uptime
                  </button>
                  <button
                    onClick={() => handleExecuteTerminalCommand('whoami')}
                    className="px-2.5 py-1 text-xs font-mono font-medium bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg shadow-2xs transition-colors"
                  >
                    whoami
                  </button>

                  {/* Contextual Database Commands */}
                  {image.toLowerCase().includes('postgres') && (
                    <>
                      <button
                        onClick={() => handleExecuteTerminalCommand('psql -V')}
                        className="px-2.5 py-1 text-xs font-mono font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg shadow-2xs transition-colors"
                      >
                        psql -V
                      </button>
                      <button
                        onClick={() => handleExecuteTerminalCommand('psql -U postgres -c "\\l"')}
                        className="px-2.5 py-1 text-xs font-mono font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg shadow-2xs transition-colors"
                      >
                        psql -U postgres \l
                      </button>
                    </>
                  )}

                  {image.toLowerCase().includes('redis') && (
                    <>
                      <button
                        onClick={() => handleExecuteTerminalCommand('redis-cli ping')}
                        className="px-2.5 py-1 text-xs font-mono font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg shadow-2xs transition-colors"
                      >
                        redis-cli ping
                      </button>
                      <button
                        onClick={() => handleExecuteTerminalCommand('redis-cli info')}
                        className="px-2.5 py-1 text-xs font-mono font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg shadow-2xs transition-colors"
                      >
                        redis-cli info
                      </button>
                    </>
                  )}

                  {(image.toLowerCase().includes('mysql') || image.toLowerCase().includes('mariadb')) && (
                    <button
                      onClick={() => handleExecuteTerminalCommand('mariadb -V')}
                      className="px-2.5 py-1 text-xs font-mono font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg shadow-2xs transition-colors"
                    >
                      mariadb -V
                    </button>
                  )}

                  <button
                    onClick={() => handleExecuteTerminalCommand('clear')}
                    className="px-2.5 py-1 text-xs font-mono font-medium bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg ml-auto transition-colors"
                  >
                    clear
                  </button>
                </div>
              </div>

              {/* Card 2: External SSH & CLI Connection Instructions */}
              <div className="bg-slate-900 text-slate-100 rounded-xl p-6 border border-slate-800 space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Key className="w-4 h-4 text-amber-400" />
                    <span>Acesso Remoto via SSH e Linha de Comando (CLI)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Conecte-se com segurança a partir do terminal da sua máquina local (macOS, Linux, WSL ou PuTTY) ao container.
                  </p>
                </div>

                {/* Host and User Inputs to customize generated commands live */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Endereço Host / IP do Servidor VPS
                    </label>
                    <input
                      type="text"
                      value={sshHostInput}
                      onChange={(e) => setSshHostInput(e.target.value)}
                      placeholder="ex: 192.168.1.100 ou bla.com.br"
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Usuário SSH do Host
                    </label>
                    <input
                      type="text"
                      value={sshUserInput}
                      onChange={(e) => setSshUserInput(e.target.value)}
                      placeholder="ex: root ou ubuntu"
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Porta SSH do Host
                    </label>
                    <input
                      type="text"
                      value={sshPortInput}
                      onChange={(e) => setSshPortInput(e.target.value)}
                      placeholder="22"
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Command 1: SSH Remote Exec (Best Practice) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>1. Conexão SSH via Host (Recomendado — Seguro & Sem Portas Expostas)</span>
                    </span>
                    <span className="text-[11px] text-slate-400">Direto no terminal local</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Abre instantaneamente uma sessão interativa no container através da conexão SSH criptografada com a sua VPS:
                  </p>
                  <div className="flex items-center justify-between bg-slate-950 px-4 py-3 rounded-lg border border-slate-800 font-mono text-xs text-emerald-300">
                    <span className="select-all break-all">
                      ssh {sshPortInput !== '22' ? `-p ${sshPortInput} ` : ''}-t {sshUserInput || 'root'}@{sshHostInput || 'seu-servidor'} &quot;docker exec -it {targetContainerFocus} {selectedShell}&quot;
                    </span>
                    <button
                      onClick={() =>
                        handleCopyClipboard(
                          `ssh ${sshPortInput !== '22' ? `-p ${sshPortInput} ` : ''}-t ${sshUserInput || 'root'}@${sshHostInput || 'seu-servidor'} "docker exec -it ${targetContainerFocus} ${selectedShell}"`,
                          'Comando SSH Remoto'
                        )
                      }
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors ml-3 shrink-0"
                      title="Copiar comando SSH"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Command 2: Direct Docker CLI */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                      <Terminal className="w-4 h-4 text-blue-400" />
                      <span>2. Execução Direta no Servidor (Docker CLI)</span>
                    </span>
                    <span className="text-[11px] text-slate-400">Se já estiver logado no servidor</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex items-center justify-between bg-slate-950 px-3 py-2.5 rounded-lg border border-slate-800 font-mono text-xs text-slate-200">
                      <span className="select-all truncate">
                        docker exec -it {targetContainerFocus} {selectedShell}
                      </span>
                      <button
                        onClick={() =>
                          handleCopyClipboard(
                            `docker exec -it ${targetContainerFocus} ${selectedShell}`,
                            'Comando Docker Exec'
                          )
                        }
                        className="text-slate-400 hover:text-white ml-2 shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-slate-950 px-3 py-2.5 rounded-lg border border-slate-800 font-mono text-xs text-slate-200">
                      <span className="select-all truncate">
                        docker exec -it -u 0 {targetContainerFocus} {selectedShell}
                      </span>
                      <button
                        onClick={() =>
                          handleCopyClipboard(
                            `docker exec -it -u 0 ${targetContainerFocus} ${selectedShell}`,
                            'Comando Docker Exec Root'
                          )
                        }
                        className="text-slate-400 hover:text-white ml-2 shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Command 3: File Transfer (Docker CP) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                      <HardDrive className="w-4 h-4 text-purple-400" />
                      <span>3. Transferência de Arquivos (Upload & Download via Docker CP)</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Enviar arquivo para o container</span>
                      <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 font-mono text-xs text-slate-300">
                        <span className="select-all truncate">
                          docker cp ./arquivo.txt {targetContainerFocus}:/app/
                        </span>
                        <button
                          onClick={() =>
                            handleCopyClipboard(`docker cp ./arquivo.txt ${targetContainerFocus}:/app/`, 'Docker CP Upload')
                          }
                          className="text-slate-400 hover:text-white ml-2 shrink-0"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Baixar arquivo ou pasta do container</span>
                      <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 font-mono text-xs text-slate-300">
                        <span className="select-all truncate">
                          docker cp {targetContainerFocus}:/app/dados ./backup/
                        </span>
                        <button
                          onClick={() =>
                            handleCopyClipboard(`docker cp ${targetContainerFocus}:/app/dados ./backup/`, 'Docker CP Download')
                          }
                          className="text-slate-400 hover:text-white ml-2 shrink-0"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Helpful Note about OpenSSH daemon in containers */}
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-white">Por que o comando via Host é a melhor prática?</span>
                    <p className="mt-0.5">
                      Executar via <code className="text-emerald-400">ssh -t user@host &quot;docker exec -it ...&quot;</code> utiliza a infraestrutura de segurança do host, evitando abrir portas SSH desnecessárias na internet e sem exigir a instalação pesada de daemons SSH em cada container Docker.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: LOGS EM TEMPO REAL */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                    <Terminal className="w-4 h-4 text-blue-600" />
                    <span>Logs do Container:</span>
                    <span className="font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs font-bold">
                      {targetContainerFocus}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Saída padrão stdout / stderr coletada diretamente da Docker Engine.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Container Switcher for Logs */}
                  {containersList.length > 1 && (
                    <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                      <Boxes className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="text-[11px] font-semibold text-slate-600">Container:</span>
                      <select
                        value={targetContainerFocus}
                        onChange={(e) => setTargetContainerFocus(e.target.value)}
                        className="text-xs font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-300 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        {containersList.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} {c.composeService ? `(${c.composeService})` : ''} {c.name === containerName ? '⭐' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    onClick={() => fetchLogs()}
                    disabled={isLoadingLogs}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
                    <span>Atualizar</span>
                  </button>
                  <button
                    onClick={() => handleCopyClipboard(logsContent, 'Logs')}
                    className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
                    title="Copiar logs"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="relative rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-emerald-400 shadow-inner max-h-[500px] overflow-y-auto">
                <pre className="whitespace-pre-wrap leading-relaxed select-text">
                  {logsContent || 'Carregando logs do container...'}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Domain Modal for specific Container */}
      {quickDomainModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Associar Domínio à Instância</h3>
              </div>
              <button
                onClick={() => setQuickDomainModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickDomain} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Instância / Componente de Destino
                </label>
                <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg font-mono text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>{quickDomainComponentName || (quickDomainTargetContainer.startsWith('[') ? 'Múltiplas Réplicas (Load Balancer)' : quickDomainTargetContainer)}</span>
                  <span className="text-blue-600 font-semibold text-[11px] font-sans">Stack: {service.name}</span>
                </div>
                {quickDomainTargetContainer.startsWith('[') && (
                  <p className="text-[10px] text-indigo-600 font-semibold mt-1 flex items-center gap-1">
                    <Scale className="w-3 h-3" />
                    <span>Balanceamento de carga ativo entre todas as réplicas desta instância.</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nome do Domínio (FQDN)
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={quickDomainInput}
                    onChange={(e) => setQuickDomainInput(e.target.value)}
                    placeholder={`ex: api.${mainDomain}`}
                    className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Porta Interna
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="65535"
                    value={quickDomainTargetPort}
                    onChange={(e) => setQuickDomainTargetPort(Number(e.target.value))}
                    className="w-full px-2 py-2 text-xs font-mono font-bold text-center rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  O Traefik criará a rota HTTPS com Cloudflare SSL apontando <strong>{quickDomainInput || 'seu-dominio'}</strong> diretamente para <strong>{quickDomainTargetContainer}:{quickDomainTargetPort}</strong>.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQuickDomainModalOpen(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuickDomain || !quickDomainInput.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{isSavingQuickDomain ? 'Vinculando...' : 'Vincular no Traefik'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dedicated Container Logs Modal */}
      {modalLogsContainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-slate-900 rounded-xl shadow-2xl border border-slate-800 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Logs do Container:</span>
                  <span className="font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    {modalLogsContainer}
                  </span>
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {/* Tail Selector */}
                <select
                  value={modalLogsTail}
                  onChange={(e) => setModalLogsTail(Number(e.target.value))}
                  className="bg-slate-800 text-xs text-slate-300 rounded px-2 py-1 border border-slate-700 font-mono cursor-pointer"
                >
                  <option value={50}>50 linhas</option>
                  <option value={100}>100 linhas</option>
                  <option value={200}>200 linhas</option>
                  <option value={500}>500 linhas</option>
                  <option value={1000}>1000 linhas</option>
                </select>

                {/* Auto Refresh Toggle */}
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300 bg-slate-800/60 px-2 py-1 rounded border border-slate-700/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modalLogsAutoRefresh}
                    onChange={(e) => setModalLogsAutoRefresh(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-emerald-500 focus:ring-emerald-500 border-slate-600 bg-slate-700"
                  />
                  <span>Auto (3s)</span>
                </label>

                {/* Manual Refresh */}
                <button
                  type="button"
                  onClick={fetchModalLogs}
                  disabled={modalLogsLoading}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
                  title="Recarregar logs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${modalLogsLoading ? 'animate-spin' : ''}`} />
                </button>

                {/* Copy logs */}
                <button
                  type="button"
                  onClick={() => handleCopyClipboard(modalLogsContent, `Logs de ${modalLogsContainer}`)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
                  title="Copiar logs"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setModalLogsContainer(null)}
                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="px-5 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
              <input
                type="text"
                value={modalLogsFilter}
                onChange={(e) => setModalLogsFilter(e.target.value)}
                placeholder="Filtrar linhas do log (ex: error, warning, status)..."
                className="w-full bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {/* Logs Viewer Content */}
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-emerald-400/90 leading-relaxed bg-black/70 select-text max-h-[60vh]">
              <pre className="whitespace-pre-wrap break-all">
                {modalLogsFilter
                  ? modalLogsContent
                      .split('\n')
                      .filter((l) => l.toLowerCase().includes(modalLogsFilter.toLowerCase()))
                      .join('\n') || `Nenhum log encontrado para o filtro "${modalLogsFilter}".`
                  : modalLogsContent || 'Carregando logs do container...'}
              </pre>
            </div>

            {/* Footer */}
            <div className="px-5 py-2.5 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Docker Engine Socket (/var/run/docker.sock) • STDOUT / STDERR</span>
              <button
                type="button"
                onClick={() => setModalLogsContainer(null)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Container Terminal & SSH Modal */}
      {modalTerminalContainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-slate-900 rounded-xl shadow-2xl border border-slate-800 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <TerminalSquare className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Terminal Interativo:</span>
                  <span className="font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    {modalTerminalContainer}
                  </span>
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {/* Shell switcher */}
                <div className="flex items-center bg-slate-800 p-0.5 rounded text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setModalTerminalShell('/bin/sh')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      modalTerminalShell === '/bin/sh'
                        ? 'bg-slate-900 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    /bin/sh
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTerminalShell('/bin/bash')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      modalTerminalShell === '/bin/bash'
                        ? 'bg-slate-900 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    /bin/bash
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setModalTerminalHistory([])}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-mono transition-colors"
                  title="Limpar tela"
                >
                  Clear
                </button>

                <button
                  type="button"
                  onClick={() => setModalTerminalContainer(null)}
                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Command Chips Toolbar */}
            <div className="px-5 py-2 bg-slate-950/80 border-b border-slate-800/80 flex items-center gap-1.5 flex-wrap text-xs">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mr-1">Atalhos:</span>
              {['ls -la', 'env', 'ps aux', 'df -h', 'whoami', 'netstat -tuln', 'cat .env'].map((cmdChip) => (
                <button
                  key={cmdChip}
                  type="button"
                  onClick={() => handleExecuteModalTerminal(cmdChip)}
                  className="px-2 py-0.5 font-mono text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                >
                  {cmdChip}
                </button>
              ))}
            </div>

            {/* Interactive Terminal Output and Prompt */}
            <div className="flex-1 p-4 bg-black/90 font-mono text-xs overflow-y-auto max-h-[50vh] space-y-2 select-text">
              {modalTerminalHistory.map((item) => (
                <div key={item.id} className="space-y-1">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-emerald-400 font-bold select-none">
                      root@{modalTerminalContainer}:/app#
                    </span>
                    <span className="text-white font-semibold">{item.command}</span>
                    <span className="text-[10px] text-slate-600 ml-auto select-none">{item.time}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-all text-slate-300 pl-2 border-l border-slate-800 font-mono leading-relaxed">
                    {renderAnsiOutput(item.output)}
                  </div>
                </div>
              ))}

              {/* Active Prompt Line */}
              <div className="pt-2 flex items-center gap-2 text-slate-200">
                <span className="text-emerald-400 font-semibold shrink-0 select-none">
                  root@{modalTerminalContainer}:/app#
                </span>
                <input
                  ref={modalTerminalInputRef}
                  type="text"
                  value={modalTerminalCmd}
                  onChange={(e) => setModalTerminalCmd(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleExecuteModalTerminal();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      if (modalTerminalCmdHistory.length === 0) return;
                      const nextIdx = Math.min(modalTerminalHistoryIndex + 1, modalTerminalCmdHistory.length - 1);
                      setModalTerminalHistoryIndex(nextIdx);
                      setModalTerminalCmd(modalTerminalCmdHistory[nextIdx] || '');
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (modalTerminalHistoryIndex > 0) {
                        const nextIdx = modalTerminalHistoryIndex - 1;
                        setModalTerminalHistoryIndex(nextIdx);
                        setModalTerminalCmd(modalTerminalCmdHistory[nextIdx] || '');
                      } else {
                        setModalTerminalHistoryIndex(-1);
                        setModalTerminalCmd('');
                      }
                    }
                  }}
                  disabled={modalTerminalExecuting}
                  placeholder={modalTerminalExecuting ? 'Executando comando...' : 'Digite um comando e pressione Enter...'}
                  className="flex-1 bg-transparent border-none text-white focus:outline-none font-mono text-xs placeholder:text-slate-600"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleExecuteModalTerminal()}
                  disabled={modalTerminalExecuting || !modalTerminalCmd.trim()}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[11px] font-bold rounded flex items-center gap-1 transition-colors"
                >
                  <Send className="w-3 h-3" />
                  <span>Enviar</span>
                </button>
              </div>
              <div ref={modalTerminalBottomRef} />
            </div>

            {/* Direct SSH Strip & Footer */}
            <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between bg-slate-900 px-3 py-1.5 rounded border border-slate-800 text-[11px] font-mono text-emerald-300">
                <span className="truncate select-all">
                  ssh -t {sshUserInput || 'root'}@{sshHostInput || 'seu-servidor'} &quot;docker exec -it {modalTerminalContainer} {modalTerminalShell}&quot;
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyClipboard(
                      `ssh -t ${sshUserInput || 'root'}@${sshHostInput || 'seu-servidor'} "docker exec -it ${modalTerminalContainer} ${modalTerminalShell}"`,
                      'Comando SSH Direto'
                    )
                  }
                  className="ml-2 text-slate-400 hover:text-white shrink-0"
                  title="Copiar comando SSH para executar no seu terminal local"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Comandos executam diretamente no container via Docker Socket sem sair da página.</span>
                <button
                  type="button"
                  onClick={() => setModalTerminalContainer(null)}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Visualizar Logs de Build Anterior */}
      {selectedBuildForLogs && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs text-white">
                  Logs da Compilação #{selectedBuildForLogs.id.slice(-8)}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    selectedBuildForLogs.status === 'success'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : selectedBuildForLogs.status === 'failed'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  }`}
                >
                  {selectedBuildForLogs.status}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyClipboard(selectedBuildForLogs.logs || '', 'Logs de Build')}
                  className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1 transition-colors"
                  title="Copiar todos os logs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBuildForLogs(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="px-5 py-2.5 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-slate-400 font-mono">
              {selectedBuildForLogs.gitCommit && (
                <div className="flex items-center gap-1.5 text-slate-300">
                  <GitCommit className="w-3.5 h-3.5 text-blue-400" />
                  <span>{selectedBuildForLogs.gitCommit}</span>
                </div>
              )}
              {selectedBuildForLogs.startedAt && (
                <div>Início: {new Date(selectedBuildForLogs.startedAt).toLocaleString('pt-BR')}</div>
              )}
              {selectedBuildForLogs.trigger && (
                <div>Origem: <span className="text-slate-300 uppercase">{selectedBuildForLogs.trigger}</span></div>
              )}
            </div>

            <pre className="p-4 text-emerald-400 font-mono text-[11px] leading-relaxed whitespace-pre-wrap overflow-y-auto flex-1 selection:bg-blue-600 selection:text-white">
              {selectedBuildForLogs.logs || 'Nenhum log gravado para esta compilação.'}
            </pre>

            <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedBuildForLogs(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Adicionar Nova Instância / Componente à Stack */}
      {addInstanceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Adicionar Instância / Componente</h3>
                  <p className="text-[11px] text-slate-500">Agrupe um novo container sob a stack "{service.name}"</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddInstanceModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddInstance} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-emerald-700 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Preencher com Template Pronto (Opcional):</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Auto-preenche campos</span>
                </label>
                <select
                  onChange={(e) => {
                    const tpl = stackTemplatesList.find((t) => t.id === e.target.value);
                    if (tpl) {
                      setNewInstanceName(`${service.containerName}-${tpl.id}`);
                      setNewInstanceImage(tpl.defaultImage);
                      setNewInstancePort(String(tpl.defaultPort));
                      const initialEnvs: string[] = [];
                      tpl.fields?.forEach((f: any) => {
                        if (f.defaultValue) initialEnvs.push(`${f.key}=${f.defaultValue}`);
                      });
                      setNewInstanceEnvs(initialEnvs.join('\n'));
                    }
                  }}
                  className="w-full px-3 py-1.5 text-xs bg-emerald-50/50 border border-emerald-200 rounded-lg font-medium text-slate-800 focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">Selecione um template pronto...</option>
                  {stackTemplatesList.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} ({tpl.defaultImage} :{tpl.defaultPort})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Container <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value)}
                  placeholder="ex: redis-srv, pgadmin-srv, worker-queue"
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Imagem Docker <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newInstanceImage}
                  onChange={(e) => setNewInstanceImage(e.target.value)}
                  placeholder="ex: redis:7-alpine, dpage/pgadmin4"
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Porta Interna (TCP/HTTP)
                  </label>
                  <input
                    type="number"
                    value={newInstancePort}
                    onChange={(e) => setNewInstancePort(e.target.value)}
                    placeholder="ex: 6379, 80"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Porta interna do container.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Porta Pública Host (Opcional)
                  </label>
                  <input
                    type="number"
                    value={newInstanceHostPort}
                    onChange={(e) => setNewInstanceHostPort(e.target.value)}
                    placeholder="ex: 6379, 5432"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Mapear 0.0.0.0 na máquina host.</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Variáveis de Ambiente Iniciais (Opcional)
                </label>
                <textarea
                  rows={3}
                  value={newInstanceEnvs}
                  onChange={(e) => setNewInstanceEnvs(e.target.value)}
                  placeholder="KEY1=VALUE1&#10;KEY2=VALUE2"
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none resize-none"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">As variáveis globais da stack também serão mescladas automaticamente.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Volumes / Mapeamento de Pastas (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={newInstanceVolumes}
                  onChange={(e) => setNewInstanceVolumes(e.target.value)}
                  placeholder="/host/path:/container/path ou volume_name:/data"
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Comando de Inicialização (Cmd - Opcional)
                </label>
                <input
                  type="text"
                  value={newInstanceCommand}
                  onChange={(e) => setNewInstanceCommand(e.target.value)}
                  placeholder="ex: redis-server --appendonly yes"
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddInstanceModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNewInstance}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50"
                >
                  {isSubmittingNewInstance ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Criando Instância...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Criar e Anexar à Stack</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Templates Prontos para a Stack */}
      {stackTemplateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Adicionar Template Pronto à Stack</h3>
                  <p className="text-xs text-slate-500">
                    Instale bancos de dados, caches e ferramentas web sob o serviço <strong className="text-slate-800">{service.name}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStackTemplateModalOpen(false);
                  setSelectedStackTemplate(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Categorias */}
            <div className="px-6 pt-3 pb-2 border-b border-slate-100 flex items-center gap-2 overflow-x-auto bg-slate-50/50">
              {[
                { id: 'all', label: 'Todos os Templates' },
                { id: 'database', label: 'Bancos de Dados' },
                { id: 'cache_queue', label: 'Cache & Mensageria' },
                { id: 'tools_web', label: 'Ferramentas Web' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setStackTemplateCategory(cat.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    stackTemplateCategory === cat.id
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200/60 border border-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Grid de Templates ou Formulário do Template Selecionado */}
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              {!selectedStackTemplate ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {stackTemplatesList
                    .filter((t) => stackTemplateCategory === 'all' || t.category === stackTemplateCategory)
                    .map((tpl) => (
                      <div
                        key={tpl.id}
                        onClick={() => setSelectedStackTemplate(tpl)}
                        className="p-4 rounded-xl border border-slate-200 bg-white hover:border-emerald-500 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                                <Database className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                                  {tpl.name}
                                </h4>
                                <span className="font-mono text-[10px] text-slate-400">{tpl.defaultImage}</span>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              :{tpl.defaultPort}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-relaxed">{tpl.description}</p>
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold">{tpl.categoryLabel || tpl.category}</span>
                          <span className="font-semibold text-emerald-700 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                            <span>Instalar</span>
                            <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <form onSubmit={handleDeployStackTemplate} className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setSelectedStackTemplate(null)}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Voltar aos templates</span>
                      </button>
                      <span className="text-slate-300">|</span>
                      <span className="text-xs font-bold text-slate-900">{selectedStackTemplate.name}</span>
                    </div>
                    <span className="text-xs font-mono text-slate-500">{selectedStackTemplate.defaultImage} (porta :{selectedStackTemplate.defaultPort})</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nome da Nova Instância / Container <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={stackTemplateContainerName}
                      onChange={(e) => setStackTemplateContainerName(e.target.value)}
                      placeholder="ex: meu-projeto-postgres"
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  {selectedStackTemplate.fields && selectedStackTemplate.fields.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                        Parâmetros de Configuração do Template
                      </h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {selectedStackTemplate.fields.map((f: any) => (
                          <div key={f.key}>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              {f.label} {f.required && <span className="text-rose-500">*</span>}
                            </label>
                            <input
                              type={f.type === 'password' ? 'text' : f.type || 'text'}
                              required={f.required}
                              value={stackTemplateFieldValues[f.key] || ''}
                              onChange={(e) =>
                                setStackTemplateFieldValues((prev) => ({
                                  ...prev,
                                  [f.key]: e.target.value,
                                }))
                              }
                              placeholder={f.defaultValue || f.key}
                              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Porta Pública no Host (Opcional)
                    </label>
                    <input
                      type="number"
                      value={stackTemplateHostPort}
                      onChange={(e) => setStackTemplateHostPort(e.target.value)}
                      placeholder={`ex: ${selectedStackTemplate.defaultPort} (para expor na VPS/Host fora do Traefik)`}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Deixe vazio se desejar que este componente fique acessível somente internamente dentro da rede Docker/Traefik.
                    </p>
                  </div>

                  <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      O container será criado, anexo à rede <strong className="font-mono">proxy-net</strong> e associado diretamente
                      à stack <strong className="font-mono">{service.name}</strong> com todas as variáveis geradas automaticamente.
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedStackTemplate(null)}
                      className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingStackTemplate}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50"
                    >
                      {isSubmittingStackTemplate ? (
                        <>
                          <RotateCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Instalando Template na Stack...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Adicionar à Stack</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Variáveis de Ambiente da Instância Individual (Portainer Style) */}
      {instanceEnvModalContainer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Variáveis de Ambiente da Instância</h3>
                    <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      {instanceEnvModalContainer}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Defina variáveis e credenciais exclusivas desta instância.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInstanceEnvModalContainer(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation Tabs & Presets Toolbar */}
            <div className="px-5 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/50">
              {/* Visual vs Raw vs Merged Mode Toggle */}
              <div className="flex items-center bg-slate-200 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setInstanceEnvTab('visual')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    instanceEnvTab === 'visual'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tabela Visual
                </button>
                <button
                  type="button"
                  onClick={() => setInstanceEnvTab('raw')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    instanceEnvTab === 'raw'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Arquivo .env (Texto)
                </button>
                <button
                  type="button"
                  onClick={() => setInstanceEnvTab('merged')}
                  className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1 ${
                    instanceEnvTab === 'merged'
                      ? 'bg-white text-purple-700 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Visão Mesclada ({Object.keys(instanceEnvEffectiveMap).length})</span>
                </button>
              </div>

              {/* Quick Presets & Export/Import Tools */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleInsertInstancePreset('common')}
                    className="px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 rounded transition-colors"
                    title="Inserir variáveis comuns (PORT, NODE_ENV, TZ)"
                  >
                    + Comuns
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertInstancePreset('db_postgres')}
                    className="px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 rounded transition-colors"
                    title="Inserir credenciais PostgreSQL"
                  >
                    + Postgres
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertInstancePreset('redis')}
                    className="px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 rounded transition-colors"
                    title="Inserir senha Redis"
                  >
                    + Redis
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopyClipboard(instanceEnvCustomStr, 'Variáveis')}
                  className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded border border-slate-200 transition-colors shadow-2xs"
                  title="Copiar todas as variáveis"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleExportInstanceEnv}
                  className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded border border-slate-200 transition-colors shadow-2xs"
                  title="Baixar arquivo .env"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>

                <label
                  className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded border border-slate-200 transition-colors shadow-2xs cursor-pointer"
                  title="Importar de arquivo .env local"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <input type="file" accept=".env,text/plain" onChange={handleImportInstanceEnv} className="hidden" />
                </label>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {instanceEnvLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                  <RotateCw className="w-5 h-5 animate-spin text-purple-600" />
                  <span>Carregando variáveis da instância...</span>
                </div>
              ) : instanceEnvTab === 'visual' ? (
                /* TABELA VISUAL */
                <div className="space-y-3">
                  {/* Toolbar de Busca e Adição */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <input
                        type="text"
                        placeholder="Filtrar variáveis por chave ou valor..."
                        value={instanceEnvFilter}
                        onChange={(e) => setInstanceEnvFilter(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddInstanceEnvRow}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Variável</span>
                    </button>
                  </div>

                  {/* Tabela de Chave / Valor */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider font-sans">
                        <tr>
                          <th className="px-4 py-2.5 w-5/12">Chave (KEY)</th>
                          <th className="px-4 py-2.5 w-6/12">Valor (VALUE)</th>
                          <th className="px-4 py-2.5 w-1/12 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredInstanceEnvRows.length > 0 ? (
                          filteredInstanceEnvRows.map((row, idx) => {
                            const isRevealed = instanceEnvVisibleSecrets[idx] || false;
                            return (
                              <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-4 py-2">
                                  <input
                                    type="text"
                                    value={row.key}
                                    onChange={(e) => handleUpdateInstanceEnvRow(idx, e.target.value, row.value)}
                                    placeholder="NOME_DA_VARIAVEL"
                                    className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 uppercase text-xs"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <div className="relative flex items-center">
                                    <input
                                      type={row.isSecret && !isRevealed ? 'password' : 'text'}
                                      value={row.value}
                                      onChange={(e) => handleUpdateInstanceEnvRow(idx, row.key, e.target.value)}
                                      placeholder="valor_da_variavel"
                                      className="w-full pr-8 pl-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                                    />
                                    {row.isSecret && (
                                      <button
                                        type="button"
                                        onClick={() => toggleInstanceSecret(idx)}
                                        className="absolute right-2 text-slate-400 hover:text-slate-700"
                                        title={isRevealed ? 'Ocultar segredo' : 'Exibir segredo'}
                                      >
                                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleCopyClipboard(`${row.key}=${row.value}`, row.key)}
                                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                                      title="Copiar linha"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveInstanceEnvRow(idx)}
                                      className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                                      title="Remover variável"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={3} className="px-4 py-8 text-center text-slate-400 font-sans text-xs">
                              <p className="mb-2">Nenhuma variável exclusiva configurada para esta instância.</p>
                              <button
                                type="button"
                                onClick={handleAddInstanceEnvRow}
                                className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-800 font-semibold"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Adicionar primeira variável</span>
                              </button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : instanceEnvTab === 'raw' ? (
                /* ARQUIVO .ENV (TEXTO) */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">
                      Editor Customizado .env para <span className="font-mono text-purple-700">{instanceEnvModalContainer}</span>:
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">Formato KEY=VALUE</span>
                  </div>

                  <textarea
                    rows={12}
                    value={instanceEnvCustomStr}
                    onChange={(e) => setInstanceEnvCustomStr(e.target.value)}
                    placeholder="REDIS_PASSWORD=minha_senha&#10;WORKER_QUEUE=high-priority&#10;PORT=8080"
                    className="w-full p-3.5 text-xs bg-slate-900 text-emerald-400 font-mono rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 leading-relaxed resize-none selection:bg-purple-600 selection:text-white"
                  />
                  <p className="text-[11px] text-slate-500">
                    Ao salvar, a instância <strong className="text-slate-800 font-mono">{instanceEnvModalContainer}</strong> e
                    todas as suas réplicas serão recriadas para aplicar estas variáveis de ambiente.
                  </p>
                </div>
              ) : (
                /* VISÃO MESCLADA (STACK + INSTÂNCIA) */
                <div className="space-y-3">
                  <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-xl text-xs text-purple-900 flex items-start gap-2">
                    <Info className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      Esta instância herda as variáveis globais da stack. Chaves personalizadas nesta instância substituem
                      as globais com o mesmo nome e são aplicadas a todas as réplicas.
                    </p>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] font-semibold uppercase font-sans">
                        <tr>
                          <th className="px-3.5 py-2">Variável</th>
                          <th className="px-3.5 py-2">Valor Efetivo</th>
                          <th className="px-3.5 py-2 text-right">Origem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {Object.keys(instanceEnvEffectiveMap).length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-6 text-center text-slate-400 font-sans text-xs">
                              Nenhuma variável de ambiente definida.
                            </td>
                          </tr>
                        ) : (
                          Object.entries(instanceEnvEffectiveMap).map(([key, val]) => {
                            const isOverridden = key in instanceEnvCustomMap;
                            return (
                              <tr key={key} className={isOverridden ? 'bg-purple-50/30' : ''}>
                                <td className="px-3.5 py-2 font-bold text-slate-800">{key}</td>
                                <td className="px-3.5 py-2 text-slate-600 break-all select-all">{val}</td>
                                <td className="px-3.5 py-2 text-right">
                                  {isOverridden ? (
                                    <span className="px-2 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded text-[10px] font-bold">
                                      Sobrescrito na Instância
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded text-[10px] font-medium">
                                      Herdado da Stack
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setInstanceEnvModalContainer(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveInstanceEnv}
                disabled={instanceEnvSaving}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50"
              >
                {instanceEnvSaving ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Aplicando e Recriando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar e Reiniciar Instância</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Publicar Porta Pública Host para a Instância */}
      {portModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Porta Pública no Host</h3>
              </div>
              <button
                type="button"
                onClick={() => setPortModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePortModal} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Instância Selecionada
                </label>
                <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg font-mono text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>{portModalComponent}</span>
                  <span className="text-blue-600 font-semibold text-[11px] font-sans">Stack: {service.name}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Porta Interna <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    value={portModalContainerPort}
                    onChange={(e) => setPortModalContainerPort(e.target.value)}
                    placeholder="ex: 6379, 5432, 80"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Porta no container.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Porta Host (0.0.0.0)
                  </label>
                  <input
                    type="number"
                    value={portModalHostPort}
                    onChange={(e) => setPortModalHostPort(e.target.value)}
                    placeholder="ex: 6379 (ou vazio para remover)"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Porta externa aberta.</p>
                </div>
              </div>

              <div className="p-3 bg-blue-50/60 border border-blue-200/60 rounded-lg text-[11px] text-blue-800 leading-relaxed">
                💡 <strong>Dica:</strong> Se você preencher a porta host (ex: <code>6379</code>), o container será recriado mapeando <code>0.0.0.0:6379 ➔ :{portModalContainerPort}/tcp</code>, permitindo conexão direta com banco de dados ou Redis. Se deixar vazio, a porta host será desvinculada, mantendo o tráfego restrito ao Traefik e rede interna.
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPortModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingPortModal}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50"
                >
                  {isSavingPortModal ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Aplicando Porta...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Salvar e Aplicar Porta</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
