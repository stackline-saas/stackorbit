import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Server,
  GitBranch,
  Package,
  Key,
  Eye,
  EyeOff,
  Play,
  Layers,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Database,
  Globe,
  Cpu,
  HardDrive,
  Info,
  ChevronRight,
  Search,
  Lock,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  Sliders,
  Check,
  Star,
  Tag,
  Plus,
  Trash2,
  Copy,
  FileText,
  Code,
  List,
  Download,
  Upload,
  FolderGit2,
} from 'lucide-react';
import type { Service, GitProviderAccount, GitHubRepoItem, GitHubBranchItem, ProjectInspectionResult, Project, DockerHost } from '../../types/index.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useNotification } from '../../context/NotificationContext.tsx';

interface CreateServiceViewProps {
  onSave: (serviceData: Partial<Service>) => Promise<any>;
}

const PRESETS = [
  { label: 'Node.js App', image: 'node:20-alpine', port: 3000, icon: '🟩' },
  { label: 'Python / FastAPI', image: 'python:3.12-slim', port: 8000, icon: '🐍' },
  { label: 'Nginx', image: 'nginx:alpine', port: 80, icon: '⚡' },
  { label: 'PostgreSQL', image: 'postgres:16-alpine', port: 5432, icon: '🐘' },
  { label: 'Redis', image: 'redis:7-alpine', port: 6379, icon: '🔴' },
  { label: 'MySQL', image: 'mysql:8.0', port: 3306, icon: '🐬' },
  { label: 'MongoDB', image: 'mongo:7', port: 27017, icon: '🍃' },
  { label: 'MinIO', image: 'quay.io/minio/minio:latest', port: 9000, icon: '🪣' },
];

interface EnvRow {
  id: string;
  key: string;
  value: string;
  isSecret?: boolean;
}

const parseEnvToRows = (raw: string): EnvRow[] => {
  if (!raw || !raw.trim()) return [];
  const lines = raw.split('\n');
  const rows: EnvRow[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      rows.push({
        id: `env-${index}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        key,
        value,
        isSecret: /secret|pass|token|key|pwd|auth/i.test(key),
      });
    } else {
      rows.push({
        id: `env-${index}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        key: trimmed,
        value: '',
        isSecret: false,
      });
    }
  });
  return rows;
};

const serializeRowsToEnv = (rows: EnvRow[]): string => {
  return rows
    .filter((r) => r.key.trim().length > 0)
    .map((r) => `${r.key.trim()}=${r.value}`)
    .join('\n');
};

export const CreateServiceView: React.FC<CreateServiceViewProps> = ({ onSave }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { authFetch } = useAuth();
  const { showNotification } = useNotification();

  // Basic info
  const [name, setName] = useState('');
  const [containerName, setContainerName] = useState('');
  const [internalPort, setInternalPort] = useState<number | ''>(80);
  const [notes, setNotes] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  // Multi-Host & Project Destination
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [hostsList, setHostsList] = useState<DockerHost[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedHostId, setSelectedHostId] = useState<string>('');

  useEffect(() => {
    async function loadProjectsAndHosts() {
      try {
        const [projRes, hostsRes] = await Promise.all([
          authFetch('/api/projects'),
          authFetch('/api/hosts'),
        ]);
        if (projRes.ok) {
          const projs = await projRes.json();
          setProjectsList(projs);
          const activeProj = localStorage.getItem('ddm_selected_project') || projs[0]?.id || '';
          setSelectedProjectId(activeProj);
        }
        if (hostsRes.ok) {
          const hList = await hostsRes.json();
          setHostsList(hList);
          const defHost = hList.find((h: any) => h.isDefault) || hList[0];
          if (defHost) setSelectedHostId(defHost.id);
        }
      } catch {}
    }
    loadProjectsAndHosts();
  }, [authFetch]);

  // Source type
  const [sourceType, setSourceType] = useState<'IMAGE' | 'GITHUB'>('GITHUB');

  // Image source
  const [image, setImage] = useState('');

  // GitHub Provider & Repositories
  const [providers, setProviders] = useState<GitProviderAccount[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [repos, setRepos] = useState<GitHubRepoItem[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [repoVisibilityFilter, setRepoVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);
  const comboboxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Click outside to close combobox
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setIsComboboxOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus search input when combobox opens
  useEffect(() => {
    if (isComboboxOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 60);
    }
  }, [isComboboxOpen]);

  // Selected Repository & Branches
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepoItem | null>(null);
  const [branches, setBranches] = useState<GitHubBranchItem[]>([]);
  const [tags, setTags] = useState<GitHubBranchItem[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('main');

  // Inspection & Docker params
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectionResult, setInspectionResult] = useState<ProjectInspectionResult | null>(null);
  const [definitionType, setDefinitionType] = useState<'compose' | 'dockerfile'>('compose');
  const [dockerfilePath, setDockerfilePath] = useState('docker-compose.yml');
  const [buildContext, setBuildContext] = useState('.');
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [triggerInitialBuild, setTriggerInitialBuild] = useState(true);
  const [envVars, setEnvVars] = useState('');
  const [envMode, setEnvMode] = useState<'raw' | 'keyvalue'>('raw');
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);
  const [isImportingEnv, setIsImportingEnv] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual URL entry fallback toggle
  const [isManualGitMode, setIsManualGitMode] = useState(false);
  const [showAdvancedGitSettings, setShowAdvancedGitSettings] = useState(false);

  // Form submission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load connected Git Providers
  const loadGitProviders = async () => {
    setIsLoadingProviders(true);
    try {
      const res = await authFetch('/api/integrations/providers');
      if (res.ok) {
        const data = await res.json();
        setProviders(data);
        const gh = data.find((p: any) => p.provider === 'github' && p.isActive);
        if (gh) {
          loadRepositories(gh.id);
        }
      }
    } catch {} finally {
      setIsLoadingProviders(false);
    }
  };

  // Load GitHub Repositories
  const loadRepositories = async (providerId?: string) => {
    setIsLoadingRepos(true);
    try {
      const query = providerId ? `?providerId=${providerId}` : '';
      const res = await authFetch(`/api/integrations/github/repos${query}`);
      if (res.ok) {
        const data = await res.json();
        setRepos(data.repositories || []);
      }
    } catch {} finally {
      setIsLoadingRepos(false);
    }
  };

  useEffect(() => {
    loadGitProviders();

    // Check if prefill was sent via query string
    const prefillStr = searchParams.get('prefill');
    if (prefillStr) {
      try {
        const parsed = JSON.parse(decodeURIComponent(prefillStr));
        if (parsed.name) setName(parsed.name);
        if (parsed.containerName) setContainerName(parsed.containerName);
        if (parsed.image) setImage(parsed.image);
        if (parsed.internalPort) setInternalPort(parsed.internalPort);
        if (parsed.sourceType) setSourceType(parsed.sourceType);
      } catch {}
    }
  }, []);

  const activeGitHubProvider = providers.find((p) => p.provider === 'github' && p.isActive);

  // Auto-fill container name from display name
  const handleNameChange = (val: string) => {
    setName(val);
    if (!containerName) {
      setContainerName(
        val
          .toLowerCase()
          .trim()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-_]/g, '')
      );
    }
  };

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    setImage(preset.image);
    setInternalPort(preset.port);
    if (!name) {
      const n = preset.label;
      setName(n);
      setContainerName(n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, ''));
    }
  };

  // When a repository is selected from list
  const handleSelectRepository = async (repo: GitHubRepoItem) => {
    setSelectedRepo(repo);
    setGitRepoUrl(repo.cloneUrl);
    setSelectedBranch(repo.defaultBranch || 'main');

    // Auto-fill names if empty or matching previous repo
    const friendlyName = repo.name
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
    setName(friendlyName);
    setContainerName(repo.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-'));

    // Fetch branches and tags
    setIsLoadingBranches(true);
    setIsInspecting(true);
    try {
      const bRes = await authFetch(
        `/api/integrations/github/repos/${repo.owner}/${repo.name}/branches`
      );
      if (bRes.ok) {
        const bData = await bRes.json();
        setBranches(bData.branches || []);
        setTags(bData.tags || []);
        const chosenBranch = bData.defaultBranch || repo.defaultBranch || 'main';
        setSelectedBranch(chosenBranch);

        // Run inspection for Dockerfile and port
        await runInspection(repo.owner, repo.name, chosenBranch);
      }
    } catch (err: any) {
      showNotification('error', 'Falha ao inspecionar repositório', err.message);
    } finally {
      setIsLoadingBranches(false);
      setIsInspecting(false);
    }
  };

  // Run repository inspection
  const runInspection = async (owner: string, repo: string, branch: string) => {
    setIsInspecting(true);
    try {
      const res = await authFetch(
        `/api/integrations/github/repos/${owner}/${repo}/inspect?branch=${encodeURIComponent(
          branch
        )}`
      );
      if (res.ok) {
        const data: ProjectInspectionResult = await res.json();
        setInspectionResult(data);

        // Prioritize Docker Compose if detected
        if (data.hasCompose && data.detectedComposeFile) {
          setDefinitionType('compose');
          setDockerfilePath(data.detectedComposeFile);
        } else if (data.hasDockerfile && data.detectedDockerfile) {
          setDefinitionType('dockerfile');
          setDockerfilePath(data.detectedDockerfile);
        } else if (data.detectedComposeFile) {
          setDefinitionType('compose');
          setDockerfilePath(data.detectedComposeFile);
        } else {
          setDefinitionType('dockerfile');
          setDockerfilePath(data.detectedDockerfile || 'Dockerfile');
        }

        if (data.suggestedBuildContext) {
          setBuildContext(data.suggestedBuildContext);
        }
        if (data.suggestedPort) {
          setInternalPort(data.suggestedPort);
        }
      }
    } catch {} finally {
      setIsInspecting(false);
    }
  };

  // When branch selection changes
  const handleBranchChange = async (newBranch: string) => {
    setSelectedBranch(newBranch);
    if (selectedRepo) {
      await runInspection(selectedRepo.owner, selectedRepo.name, newBranch);
    }
  };

  const handleEnvModeChange = (mode: 'raw' | 'keyvalue') => {
    if (mode === 'keyvalue') {
      setEnvRows(parseEnvToRows(envVars));
    } else {
      setEnvVars(serializeRowsToEnv(envRows));
    }
    setEnvMode(mode);
  };

  const handleAddEnvRow = () => {
    const newRow: EnvRow = {
      id: `env-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      key: '',
      value: '',
      isSecret: false,
    };
    const updated = [...envRows, newRow];
    setEnvRows(updated);
    setEnvVars(serializeRowsToEnv(updated));
  };

  const handleUpdateEnvRow = (id: string, field: 'key' | 'value', val: string) => {
    const updated = envRows.map((r) => {
      if (r.id !== id) return r;
      const isSecret = field === 'key' 
        ? /secret|pass|token|key|pwd|auth/i.test(val)
        : r.isSecret;
      return { ...r, [field]: val, isSecret: field === 'key' ? isSecret : r.isSecret };
    });
    setEnvRows(updated);
    setEnvVars(serializeRowsToEnv(updated));
  };

  const handleRemoveEnvRow = (id: string) => {
    const updated = envRows.filter((r) => r.id !== id);
    setEnvRows(updated);
    setEnvVars(serializeRowsToEnv(updated));
  };

  const handleToggleRowSecret = (id: string) => {
    setEnvRows(envRows.map((r) => (r.id === id ? { ...r, isSecret: !r.isSecret } : r)));
  };

  const handleImportEnvFile = async (filePath: string) => {
    if (!selectedRepo) return;
    setIsImportingEnv(filePath);
    try {
      const res = await authFetch(
        `/api/integrations/github/repos/${selectedRepo.owner}/${selectedRepo.name}/file-content?path=${encodeURIComponent(
          filePath
        )}&branch=${encodeURIComponent(selectedBranch)}`
      );
      if (res.ok) {
        const data = await res.json();
        const content = data.content || '';
        setEnvVars(content);
        setEnvRows(parseEnvToRows(content));
        showNotification('success', 'Variáveis Importadas', `Conteúdo de "${filePath}" carregado com sucesso.`);
      } else {
        const err = await res.json();
        showNotification('error', 'Falha ao importar', err.error || 'Não foi possível ler o arquivo.');
      }
    } catch (err: any) {
      showNotification('error', 'Falha ao importar', err.message);
    } finally {
      setIsImportingEnv(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setEnvVars(text);
        setEnvRows(parseEnvToRows(text));
        showNotification('success', 'Arquivo Carregado', `Variáveis importadas de "${file.name}".`);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Filtered repositories based on search and visibility
  const filteredRepos = repos.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
      r.fullName.toLowerCase().includes(repoSearch.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(repoSearch.toLowerCase()));

    if (!matchesSearch) return false;
    if (repoVisibilityFilter === 'public') return !r.private;
    if (repoVisibilityFilter === 'private') return r.private;
    return true;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('O nome de identificação é obrigatório.');
      return;
    }
    if (!containerName.trim()) {
      setError('O nome do container Docker é obrigatório.');
      return;
    }
    if (!internalPort || Number(internalPort) < 1 || Number(internalPort) > 65535) {
      setError('A porta interna deve estar entre 1 e 65535.');
      return;
    }
    if (sourceType === 'GITHUB' && !gitRepoUrl.trim()) {
      setError('Selecione um repositório GitHub ou informe a URL de clone.');
      return;
    }
    if (sourceType === 'IMAGE' && !image.trim()) {
      setError('Informe a imagem Docker a utilizar.');
      return;
    }

    setIsSubmitting(true);
    const payload: Partial<Service> = {
      name: name.trim(),
      containerName: containerName.trim(),
      sourceType,
      internalPort: Number(internalPort),
      notes: notes.trim(),
      isDefault,
      projectId: selectedProjectId || undefined,
      dockerHostId: selectedHostId || undefined,
    } as any;

    const finalEnv = envMode === 'keyvalue' ? serializeRowsToEnv(envRows) : envVars;

    if (sourceType === 'GITHUB') {
      Object.assign(payload, {
        image: `${containerName.trim()}:latest`,
        gitRepoUrl: gitRepoUrl.trim(),
        gitBranch: selectedBranch.trim() || 'main',
        dockerfilePath: dockerfilePath.trim() || (definitionType === 'compose' ? 'docker-compose.yml' : 'Dockerfile'),
        gitProviderId: activeGitHubProvider?.id || undefined,
        buildContext: definitionType === 'compose' ? '.' : (buildContext.trim() || '.'),
        triggerInitialBuild,
        envVars: finalEnv.trim() || undefined,
      });
    } else {
      Object.assign(payload, { image: image.trim() });
    }

    const result = await onSave(payload);
    setIsSubmitting(false);

    if (result) {
      const newId = result.id || (typeof result === 'object' && result?.id);
      if (sourceType === 'GITHUB' && newId) {
        navigate(`/services/${newId}?tab=build`);
      } else {
        navigate('/services');
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/services')}
          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg transition-all"
          title="Voltar para Serviços"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <span>Cadastrar Novo Serviço</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Importe um repositório Git com autodetecção ou inicie a partir de uma imagem Docker existente.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Section: Source Switcher */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
            <h2 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-blue-600" />
              <span>Origem da Aplicação</span>
            </h2>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <span>Repositório GitHub (Recomendado)</span>
                  {sourceType === 'GITHUB' && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 ml-auto" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  Conecte seu GitHub, escolha o projeto e o sistema configura automaticamente o build, branch e portas.
                </p>
              </button>

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
                  <span>Docker Registry / Imagem Pronta</span>
                  {sourceType === 'IMAGE' && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 ml-auto" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  Instancie a partir de uma imagem do Docker Hub (ex: <code className="font-mono">postgres:16</code>, <code className="font-mono">redis:7</code>, <code className="font-mono">nginx:alpine</code>).
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* GITHUB SOURCE MODE: REPOSITORY SELECTOR & SMART CONFIGURATION */}
        {/* ================================================================= */}
        {sourceType === 'GITHUB' && (
          <div className="space-y-6">
            {/* Account Status / Connect Bar */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-2xs">
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 rounded-t-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-900">Projetos do GitHub</span>
                </div>

                <div className="flex items-center gap-3">
                  {activeGitHubProvider ? (
                    <div className="flex items-center gap-2">
                      {activeGitHubProvider.avatarUrl && (
                        <img
                          src={activeGitHubProvider.avatarUrl}
                          alt={activeGitHubProvider.accountName}
                          className="w-5 h-5 rounded-full"
                        />
                      )}
                      <span className="text-xs font-mono font-bold text-slate-800">
                        @{activeGitHubProvider.accountName}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate('/integrations')}
                        className="text-[11px] text-blue-600 hover:underline font-semibold"
                      >
                        Gerenciar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate('/integrations')}
                      className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Conectar Conta GitHub</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="p-5">
                {!activeGitHubProvider ? (
                  /* Not Connected State */
                  <div className="p-6 text-center rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
                      <GitBranch className="w-6 h-6" />
                    </div>
                    <div className="max-w-md mx-auto">
                      <h3 className="text-xs font-bold text-slate-900">
                        Conecte sua Conta do GitHub para Importação em 1 Clique
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Ao conectar sua conta, o sistema lista todos os seus repositórios, detecta Dockerfiles automaticamente e configura branches e portas sem você precisar digitar nada.
                      </p>
                    </div>

                    <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => navigate('/integrations')}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                      >
                        <Key className="w-3.5 h-3.5" />
                        <span>Conectar Conta GitHub em Integrações</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsManualGitMode(!isManualGitMode)}
                        className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-white rounded-lg transition-colors"
                      >
                        {isManualGitMode ? 'Ocultar entrada manual' : 'Ou preencher URL manualmente'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Connected State: Repository Combobox Selector */
                  <div className="relative" ref={comboboxRef}>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                      <span>Selecionar Repositório do GitHub <span className="text-rose-500">*</span></span>
                      {repos.length > 0 && (
                        <span className="text-[10px] text-slate-400 font-normal">
                          {repos.length} projetos disponíveis
                        </span>
                      )}
                    </label>

                    {/* Combobox Input Trigger */}
                    <button
                      type="button"
                      onClick={() => setIsComboboxOpen(!isComboboxOpen)}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-all ${
                        isComboboxOpen
                          ? 'border-blue-500 ring-2 ring-blue-500/20 bg-white'
                          : selectedRepo
                          ? 'border-slate-300 bg-white hover:border-slate-400'
                          : 'border-slate-300 bg-slate-50/50 hover:bg-white text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <GitBranch
                          className={`w-4 h-4 shrink-0 ${
                            selectedRepo ? 'text-blue-600' : 'text-slate-400'
                          }`}
                        />
                        {selectedRepo ? (
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="font-bold text-xs text-slate-900 font-mono truncate">
                              {selectedRepo.fullName}
                            </span>
                            {selectedRepo.private ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded shrink-0">
                                <Lock className="w-2.5 h-2.5" />
                                Privado
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200 shrink-0">
                                Público
                              </span>
                            )}
                            {selectedRepo.language && (
                              <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                                {selectedRepo.language}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Clique para pesquisar e escolher um projeto...
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 text-slate-400">
                        {selectedRepo && (
                          <span className="text-[11px] text-blue-600 font-semibold hover:underline">
                            Trocar
                          </span>
                        )}
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${
                            isComboboxOpen ? 'rotate-180 text-blue-600' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {/* Combobox Dropdown Popover */}
                    {isComboboxOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        {/* Search and Filters inside dropdown */}
                        <div className="p-3 border-b border-slate-100 bg-slate-50/70 space-y-2.5">
                          <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              ref={searchInputRef}
                              type="text"
                              placeholder="Pesquisar projetos nos seus repositórios do GitHub..."
                              value={repoSearch}
                              onChange={(e) => setRepoSearch(e.target.value)}
                              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            />
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-1 bg-slate-200/60 p-0.5 rounded-lg">
                              <button
                                type="button"
                                onClick={() => setRepoVisibilityFilter('all')}
                                className={`px-2 py-0.5 font-semibold rounded transition-colors ${
                                  repoVisibilityFilter === 'all'
                                    ? 'bg-white text-slate-900 shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Todos ({repos.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setRepoVisibilityFilter('public')}
                                className={`px-2 py-0.5 font-semibold rounded transition-colors ${
                                  repoVisibilityFilter === 'public'
                                    ? 'bg-white text-slate-900 shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Públicos
                              </button>
                              <button
                                type="button"
                                onClick={() => setRepoVisibilityFilter('private')}
                                className={`px-2 py-0.5 font-semibold rounded transition-colors ${
                                  repoVisibilityFilter === 'private'
                                    ? 'bg-white text-slate-900 shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Privados
                              </button>
                            </div>

                            <span className="text-slate-400">
                              {filteredRepos.length} encontrado(s)
                            </span>
                          </div>
                        </div>

                        {/* Repositories Scrollable List */}
                        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                          {isLoadingRepos ? (
                            <div className="p-6 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                              <span>Carregando repositórios...</span>
                            </div>
                          ) : filteredRepos.length > 0 ? (
                            filteredRepos.map((r) => {
                              const isSelected = selectedRepo?.id === r.id;
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => {
                                    handleSelectRepository(r);
                                    setIsComboboxOpen(false);
                                  }}
                                  className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-3 transition-colors ${
                                    isSelected ? 'bg-blue-50/80 text-blue-900' : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-xs text-slate-900 font-mono truncate">
                                        {r.fullName}
                                      </span>
                                      {r.private ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded shrink-0">
                                          <Lock className="w-2.5 h-2.5" />
                                          Privado
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200 shrink-0">
                                          Público
                                        </span>
                                      )}
                                      {r.language && (
                                        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                                          {r.language}
                                        </span>
                                      )}
                                    </div>
                                    {r.description && (
                                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                        {r.description}
                                      </p>
                                    )}
                                  </div>

                                  {isSelected && (
                                    <Check className="w-4 h-4 text-blue-600 shrink-0" />
                                  )}
                                </button>
                              );
                            })
                          ) : (
                            <div className="p-6 text-center text-slate-400 text-xs">
                              {repoSearch
                                ? `Nenhum repositório encontrado para "${repoSearch}".`
                                : 'Nenhum repositório localizado.'}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Manual Fallback Input */}
                {isManualGitMode && (
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Ou informe a URL Git Diretamente
                    </label>
                    <input
                      type="text"
                      placeholder="https://github.com/usuario/meu-projeto.git"
                      value={gitRepoUrl}
                      onChange={(e) => setGitRepoUrl(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Selected Project Settings & Detection Details */}
            {(selectedRepo || (isManualGitMode && gitRepoUrl.trim().length > 0)) && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden space-y-4">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-900">
                      Configuração de Build: {selectedRepo ? selectedRepo.name : 'Repositório Git'}
                    </span>
                  </div>

                  {isInspecting && (
                    <span className="text-[11px] text-blue-600 font-mono flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Inspecionando repositório...
                    </span>
                  )}
                </div>

                <div className="p-5 space-y-5">
                  {/* Inspection Summary Banner */}
                  {inspectionResult && (
                    <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-slate-800 space-y-1.5 flex-1">
                        <div className="font-bold flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span>Repositório analisado com sucesso!</span>
                            <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 text-[10px] font-semibold">
                              {inspectionResult.detectedType}
                            </span>
                          </div>
                          {inspectionResult.hasCompose ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                              🐳 Docker Compose Detectado
                            </span>
                          ) : inspectionResult.hasDockerfile ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                              📄 Dockerfile Detectado
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-slate-600">
                          {inspectionResult.hasCompose ? (
                            <>
                              Arquivo Docker Compose detectado em{' '}
                              <code className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-blue-200 text-blue-900">
                                {inspectionResult.detectedComposeFile}
                              </code>
                              . Os containers serão orquestrados através do <code>docker compose</code>.
                            </>
                          ) : inspectionResult.hasDockerfile ? (
                            <>
                              Dockerfile detectado em{' '}
                              <code className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-blue-200 text-blue-900">
                                {inspectionResult.detectedDockerfile}
                              </code>
                              . O container será compilado e implantado individualmente.
                            </>
                          ) : (
                            <>
                              Nenhum arquivo Dockerfile ou Docker Compose encontrado na raiz. Você pode definir o caminho manualmente abaixo.
                            </>
                          )}
                        </p>

                        {/* Compose Candidates Chip Selector */}
                        {inspectionResult.composeCandidates && inspectionResult.composeCandidates.length > 1 && (
                          <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                            <span className="text-[10px] text-slate-500 font-medium">Arquivos Compose disponíveis:</span>
                            {inspectionResult.composeCandidates.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => {
                                  setDefinitionType('compose');
                                  setDockerfilePath(c);
                                }}
                                className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                                  dockerfilePath === c && definitionType === 'compose'
                                    ? 'bg-blue-600 text-white border-blue-600 font-bold'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Branch & Tag Selector */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                        <GitBranch className="w-3.5 h-3.5 text-blue-600" />
                        <span>Branch de Deploy</span>
                        {isLoadingBranches && (
                          <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                        )}
                      </label>
                      {branches.length > 0 ? (
                        <select
                          value={selectedBranch}
                          onChange={(e) => handleBranchChange(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <optgroup label="Branches">
                            {branches.map((b) => (
                              <option key={b.name} value={b.name}>
                                {b.name} {b.name === selectedRepo?.defaultBranch ? '⭐ (padrão)' : ''}
                              </option>
                            ))}
                          </optgroup>
                          {tags.length > 0 && (
                            <optgroup label="Tags de Versão">
                              {tags.map((t) => (
                                <option key={t.name} value={t.name}>
                                  tag: {t.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={selectedBranch}
                          onChange={(e) => setSelectedBranch(e.target.value)}
                          placeholder="main"
                          className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      )}
                      <p className="text-[11px] text-slate-400 mt-1">
                        A cada commit nesta branch, o Worker fará o build e deploy automaticamente.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Porta Interna da Aplicação <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min={1}
                        max={65535}
                        value={internalPort}
                        onChange={(e) =>
                          setInternalPort(e.target.value ? Number(e.target.value) : '')
                        }
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Porta exposta pelo container (sugerida automaticamente: {internalPort}).
                      </p>
                    </div>
                  </div>

                  {/* Definition Type Selector & File Path */}
                  <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-blue-600" />
                        <span>Modo de Definição do Serviço</span>
                      </label>
                      <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => {
                            setDefinitionType('compose');
                            if (dockerfilePath === 'Dockerfile' || (!dockerfilePath.endsWith('.yml') && !dockerfilePath.endsWith('.yaml'))) {
                              setDockerfilePath(inspectionResult?.detectedComposeFile || 'docker-compose.yml');
                            }
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                            definitionType === 'compose'
                              ? 'bg-white text-blue-700 shadow-2xs font-bold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <span>🐳 Docker Compose (Stack)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDefinitionType('dockerfile');
                            if (dockerfilePath.endsWith('.yml') || dockerfilePath.endsWith('.yaml')) {
                              setDockerfilePath(inspectionResult?.detectedDockerfile || 'Dockerfile');
                            }
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                            definitionType === 'dockerfile'
                              ? 'bg-white text-blue-700 shadow-2xs font-bold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <span>📄 Dockerfile Individual</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {definitionType === 'compose'
                          ? 'Caminho do Arquivo Docker Compose (ex: docker-compose.yml ou infra/docker-compose.yml)'
                          : 'Caminho do Dockerfile (ex: Dockerfile ou docker/Dockerfile)'}
                      </label>
                      <input
                        type="text"
                        required
                        value={dockerfilePath}
                        onChange={(e) => setDockerfilePath(e.target.value)}
                        placeholder={definitionType === 'compose' ? 'docker-compose.yml ou infra/docker-compose.yml' : 'Dockerfile'}
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        {definitionType === 'compose'
                          ? 'O Worker executará `docker compose up -d --build`, levantará todos os containers da stack e os conectará à rede proxy-net.'
                          : 'O Worker compilará a imagem usando o Dockerfile e executará o container principal na rede proxy-net.'}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Advanced Build Options */}
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedGitSettings(!showAdvancedGitSettings)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1.5"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>
                        {showAdvancedGitSettings
                          ? 'Ocultar configurações avançadas de build'
                          : 'Ajustar Contexto de Build, Token PAT e Variáveis de Ambiente'}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          showAdvancedGitSettings ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {showAdvancedGitSettings && (
                    <div className="space-y-4 pt-2">
                      {/* Contexto do Build: apenas necessário se for Dockerfile individual */}
                      {definitionType === 'dockerfile' && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Contexto do Build (Root Directory)
                          </label>
                          <input
                            type="text"
                            value={buildContext}
                            onChange={(e) => setBuildContext(e.target.value)}
                            placeholder="."
                            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <p className="text-[11px] text-slate-400 mt-1">
                            Diretório base do repositório a ser considerado como contexto de compilação do Dockerfile (padrão: <code>.</code>).
                          </p>
                        </div>
                      )}

                      {/* Git Account status */}
                      {activeGitHubProvider ? (
                        <div className="flex items-center gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div className="text-xs text-emerald-900">
                            <strong>Autenticação Git:</strong> Utilizando credenciais da conta <strong>@{activeGitHubProvider.accountName}</strong> conectada em Integrações.
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                          <GitBranch className="w-4 h-4 text-slate-500 shrink-0" />
                          <div className="text-xs text-slate-600">
                            Para repositórios privados, certifique-se de conectar sua conta em <strong>Integrações Git</strong>.
                          </div>
                        </div>
                      )}

                      {/* Advanced Env Vars Manager */}
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                        <input
                          ref={fileInputRef}
                          type="file"
                          onChange={handleFileUpload}
                          className="hidden"
                          accept=".env,*,text/plain"
                        />

                        {/* Env Header & Mode Switcher */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <label className="block text-xs font-bold text-slate-800">
                              Variáveis de Ambiente (opcional)
                            </label>
                            <p className="text-[11px] text-slate-500">
                              {definitionType === 'compose'
                                ? 'Serão gravadas no arquivo .env no diretório do Compose e passadas à stack.'
                                : 'Serão injetadas no container durante o deploy.'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Mode toggle */}
                            <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg text-xs font-medium">
                              <button
                                type="button"
                                onClick={() => handleEnvModeChange('raw')}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
                                  envMode === 'raw'
                                    ? 'bg-white text-slate-900 font-bold shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                <Code className="w-3.5 h-3.5" />
                                <span>Texto (.env)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEnvModeChange('keyvalue')}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
                                  envMode === 'keyvalue'
                                    ? 'bg-white text-slate-900 font-bold shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                <List className="w-3.5 h-3.5" />
                                <span>Chave - Valor</span>
                              </button>
                            </div>

                            {/* Extra Quick Action Buttons */}
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              title="Carregar arquivo .env do seu computador"
                              className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-white rounded-lg border border-slate-200 bg-white transition-all text-xs font-medium flex items-center gap-1"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline text-[11px]">Subir .env</span>
                            </button>
                          </div>
                        </div>

                        {/* Import Chips from Repository */}
                        {selectedRepo && (
                          <div className="p-3 bg-blue-50/70 rounded-lg border border-blue-200/80 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-blue-900 flex items-center gap-1.5">
                                <Download className="w-3.5 h-3.5 text-blue-600" />
                                <span>Importar .env do repositório:</span>
                              </span>
                              {isInspecting ? (
                                <span className="text-[11px] text-blue-600 flex items-center gap-1 font-mono">
                                  <RefreshCw className="w-3 h-3 animate-spin" /> Verificando arquivos...
                                </span>
                              ) : (
                                <span className="text-slate-500 text-[10px]">
                                  {inspectionResult?.envCandidates && inspectionResult.envCandidates.length > 0
                                    ? 'Clique para preencher automaticamente'
                                    : ''}
                                </span>
                              )}
                            </div>

                            {inspectionResult?.envCandidates && inspectionResult.envCandidates.length > 0 ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                {inspectionResult.envCandidates.map((file) => (
                                  <button
                                    key={file}
                                    type="button"
                                    disabled={isImportingEnv === file}
                                    onClick={() => handleImportEnvFile(file)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-white hover:bg-blue-600 hover:text-white text-slate-800 rounded-md border border-slate-300 hover:border-blue-600 font-semibold shadow-2xs transition-all disabled:opacity-50"
                                    title={`Carregar variáveis de ${file}`}
                                  >
                                    {isImportingEnv === file ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                                    ) : (
                                      <FileText className="w-3.5 h-3.5 text-blue-500" />
                                    )}
                                    <span>{file}</span>
                                    <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1 py-0.2 rounded border border-blue-200">
                                      Importar
                                    </span>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                                <span>Nenhum arquivo .env (ex: .env.example, .env.prod) foi localizado na raiz deste repositório.</span>
                                <button
                                  type="button"
                                  onClick={() => runInspection(selectedRepo.owner, selectedRepo.name, selectedBranch)}
                                  className="text-blue-600 hover:underline font-semibold flex items-center gap-1"
                                >
                                  <RefreshCw className="w-3 h-3" /> Reinspecionar
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Mode 1: Raw Text (.env) */}
                        {envMode === 'raw' && (
                          <div className="space-y-2">
                            <div className="relative">
                              <textarea
                                rows={7}
                                placeholder={`# Defina as variáveis linha por linha no formato CHAVE=VALOR\nPORT=3000\nNODE_ENV=production\nDATABASE_URL=postgresql://usuario:senha@host:5432/banco\nSECRET_KEY=minha-chave-secreta`}
                                value={envVars}
                                onChange={(e) => {
                                  setEnvVars(e.target.value);
                                  setEnvRows(parseEnvToRows(e.target.value));
                                }}
                                spellCheck={false}
                                className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-900 text-emerald-400 placeholder:text-slate-600 rounded-lg border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                              />

                              {envVars && (
                                <div className="absolute right-3 top-3 flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(envVars);
                                      showNotification('info', 'Copiado', 'Variáveis copiadas para a área de transferência.');
                                    }}
                                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-[10px] flex items-center gap-1 px-2"
                                    title="Copiar todas as variáveis"
                                  >
                                    <Copy className="w-3 h-3" />
                                    <span>Copiar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEnvVars('');
                                      setEnvRows([]);
                                    }}
                                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-rose-400 hover:text-rose-300 transition-colors text-[10px] px-2"
                                    title="Limpar variáveis"
                                  >
                                    Limpar
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>
                                {envVars.trim() ? `${envVars.trim().split('\n').length} linha(s) configurada(s)` : 'Nenhuma variável configurada'}
                              </span>
                              <span>Suporta comentários iniciados com #</span>
                            </div>
                          </div>
                        )}

                        {/* Mode 2: Key - Value Editor */}
                        {envMode === 'keyvalue' && (
                          <div className="space-y-3">
                            {envRows.length === 0 ? (
                              <div className="p-6 text-center rounded-lg border border-dashed border-slate-300 bg-white space-y-2">
                                <p className="text-xs text-slate-500">
                                  Nenhuma variável cadastrada ainda.
                                </p>
                                <button
                                  type="button"
                                  onClick={handleAddEnvRow}
                                  className="px-3 py-1.5 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg border border-blue-200 inline-flex items-center gap-1 transition-colors"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Adicionar Primeira Variável</span>
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                {envRows.map((row) => (
                                  <div
                                    key={row.id}
                                    className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 shadow-2xs"
                                  >
                                    <div className="w-5/12">
                                      <input
                                        type="text"
                                        placeholder="CHAVE (ex: PORT)"
                                        value={row.key}
                                        onChange={(e) => handleUpdateEnvRow(row.id, 'key', e.target.value)}
                                        className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />
                                    </div>
                                    <span className="text-slate-400 font-mono text-xs font-bold">=</span>
                                    <div className="flex-1 relative">
                                      <input
                                        type={row.isSecret ? 'password' : 'text'}
                                        placeholder="VALOR (ex: 3000)"
                                        value={row.value}
                                        onChange={(e) => handleUpdateEnvRow(row.id, 'value', e.target.value)}
                                        className="w-full pl-2.5 pr-8 py-1.5 text-xs font-mono rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleToggleRowSecret(row.id)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                                        title={row.isSecret ? 'Mostrar valor' : 'Ocultar valor'}
                                      >
                                        {row.isSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                      </button>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveEnvRow(row.id)}
                                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                      title="Remover variável"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-1">
                              <button
                                type="button"
                                onClick={handleAddEnvRow}
                                className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 rounded-lg border border-slate-300 shadow-2xs inline-flex items-center gap-1.5 transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5 text-blue-600" />
                                <span>Adicionar Variável</span>
                              </button>

                              <span className="text-[11px] text-slate-500">
                                {envRows.length} variável(is) estruturada(s)
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Initial Build Checkbox */}
                  <div className="flex items-start gap-3 p-3.5 bg-blue-50 border border-blue-100 rounded-xl">
                    <input
                      type="checkbox"
                      id="triggerBuildCheck"
                      checked={triggerInitialBuild}
                      onChange={(e) => setTriggerInitialBuild(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                    />
                    <label htmlFor="triggerBuildCheck" className="cursor-pointer select-none">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Play className="w-3 h-3 text-blue-600" />
                        Executar build e deploy inicial imediatamente após cadastrar
                      </span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        O Worker clonará a branch <code className="font-mono text-slate-700">{selectedBranch}</code> e compilará a imagem Docker automaticamente.
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* IMAGE SOURCE MODE: DOCKER HUB / REGISTRY */}
        {/* ================================================================= */}
        {sourceType === 'IMAGE' && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
              <h2 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-blue-600" />
                <span>Imagem Docker</span>
              </h2>
            </div>
            <div className="p-5 space-y-4">
              {/* Presets */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Presets rápidos:</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-blue-50 hover:text-blue-800 border border-slate-200 hover:border-blue-200 rounded-lg transition-colors"
                    >
                      <span>{preset.icon}</span>
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tag da Imagem Docker <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required={sourceType === 'IMAGE'}
                  placeholder="Ex: postgres:16-alpine, redis:7-alpine, nginx:alpine"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Porta Interna da Imagem <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={65535}
                  value={internalPort}
                  onChange={(e) =>
                    setInternalPort(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* SERVICE IDENTIFICATION & CONTAINER SETTINGS */}
        {/* ================================================================= */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
            <h2 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-600" />
              <span>Identificação & Rede Docker</span>
            </h2>
          </div>
          <div className="p-5 space-y-4">
            {/* Projeto e Servidor Alvo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3.5 bg-slate-50/80 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <FolderGit2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Projeto de Destino</span>
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value);
                    const hostsInProj = hostsList.filter((h) => h.projectId === e.target.value);
                    if (hostsInProj.length > 0) {
                      setSelectedHostId(hostsInProj[0].id);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {projectsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.type})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Ambiente ao qual este serviço pertencerá.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-blue-600" />
                  <span>Servidor / Nó Docker</span>
                </label>
                <select
                  value={selectedHostId}
                  onChange={(e) => setSelectedHostId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {(selectedProjectId
                    ? hostsList.filter((h) => h.projectId === selectedProjectId)
                    : hostsList
                  ).map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.status}) - {h.type}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Servidor físico ou VPS onde o container será instanciado.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome de Identificação do Serviço <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: API Backend Principal"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">Nome exibido no painel de controle.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Container Docker <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: api-backend"
                  value={containerName}
                  onChange={(e) => setContainerName(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Identificador de rede na Docker network interna (proxy-net).
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Notas Operacionais (opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: Serviço principal de autenticação, time de desenvolvimento"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Section: Routing Options */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
            <h2 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              <span>Opções de Roteamento Traefik</span>
            </h2>
          </div>
          <div className="p-5">
            <div className="flex items-start gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <input
                type="checkbox"
                id="isDefaultCheck"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
              />
              <label htmlFor="isDefaultCheck" className="cursor-pointer select-none">
                <span className="text-xs font-bold text-slate-900 block">
                  Definir como Serviço Padrão (Catch-All)
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Recebe requisições de domínios apontados para este servidor que não estejam cadastrados explicitamente.
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/services')}
            className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-white rounded-xl transition-colors"
          >
            Cancelar
          </button>

          <button
            type="submit"
            disabled={isSubmitting || (sourceType === 'GITHUB' && !gitRepoUrl.trim())}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors shadow-xs flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Criando Serviço...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Criar Serviço</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
