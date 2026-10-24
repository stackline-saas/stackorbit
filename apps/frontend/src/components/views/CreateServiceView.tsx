import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import type { Service, GitProviderAccount, GitHubRepoItem, GitHubBranchItem, ProjectInspectionResult } from '../../types/index.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useNotification } from '../../context/NotificationContext.tsx';

interface CreateServiceViewProps {
  onSave: (serviceData: Partial<Service>) => Promise<boolean>;
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

  // Selected Repository & Branches
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepoItem | null>(null);
  const [branches, setBranches] = useState<GitHubBranchItem[]>([]);
  const [tags, setTags] = useState<GitHubBranchItem[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('main');

  // Inspection & Docker params
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectionResult, setInspectionResult] = useState<ProjectInspectionResult | null>(null);
  const [dockerfilePath, setDockerfilePath] = useState('Dockerfile');
  const [buildContext, setBuildContext] = useState('.');
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [gitToken, setGitToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [triggerInitialBuild, setTriggerInitialBuild] = useState(true);
  const [envVars, setEnvVars] = useState('');

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
        if (data.detectedDockerfile) {
          setDockerfilePath(data.detectedDockerfile);
        }
        if (data.suggestedBuildContext) {
          setBuildContext(data.suggestedBuildContext);
        }
        if (data.suggestedPort) {
          setInternalPort(data.suggestedPort);
        }
        if (data.token) {
          setGitToken(data.token);
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
    } as any;

    if (sourceType === 'GITHUB') {
      Object.assign(payload, {
        image: `${containerName.trim()}:latest`,
        gitRepoUrl: gitRepoUrl.trim(),
        gitBranch: selectedBranch.trim() || 'main',
        dockerfilePath: dockerfilePath.trim() || 'Dockerfile',
        gitToken: gitToken.trim() || undefined,
        buildContext: buildContext.trim() || '.',
        triggerInitialBuild,
        envVars: envVars || undefined,
      });
    } else {
      Object.assign(payload, { image: image.trim() });
    }

    const success = await onSave(payload);
    setIsSubmitting(false);

    if (success) {
      navigate('/services');
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
            <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
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
                  /* Connected State: Repository Search & List */
                  <div className="space-y-4">
                    {/* Search and Filters */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Pesquisar projetos nos seus repositórios do GitHub..."
                          value={repoSearch}
                          onChange={(e) => setRepoSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>

                      <div className="flex items-center gap-1 self-start sm:self-auto bg-slate-100 p-1 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setRepoVisibilityFilter('all')}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
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
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
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
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                            repoVisibilityFilter === 'private'
                              ? 'bg-white text-slate-900 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Privados
                        </button>
                      </div>
                    </div>

                    {/* Repository Grid / Cards */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto divide-y divide-slate-100 bg-white">
                      {isLoadingRepos ? (
                        <div className="p-8 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                          <span>Carregando seus repositórios do GitHub...</span>
                        </div>
                      ) : filteredRepos.length > 0 ? (
                        filteredRepos.map((r) => {
                          const isSelected = selectedRepo?.id === r.id;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => handleSelectRepository(r)}
                              className={`w-full p-3.5 text-left flex items-start justify-between gap-3 transition-colors ${
                                isSelected
                                  ? 'bg-blue-50/80 border-l-4 border-l-blue-600'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-xs text-slate-900 font-mono">
                                    {r.fullName}
                                  </span>
                                  {r.private ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded">
                                      <Lock className="w-2.5 h-2.5" />
                                      Privado
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                                      Público
                                    </span>
                                  )}
                                  {r.language && (
                                    <span className="text-[10px] font-medium text-slate-500 bg-slate-50 px-1.5 py-0.2 rounded">
                                      {r.language}
                                    </span>
                                  )}
                                </div>
                                {r.description && (
                                  <p className="text-[11px] text-slate-500 truncate">
                                    {r.description}
                                  </p>
                                )}
                              </div>

                              <div className="shrink-0 flex items-center gap-2">
                                {isSelected ? (
                                  <span className="px-2.5 py-1 bg-blue-600 text-white rounded-md text-[11px] font-bold flex items-center gap-1">
                                    <Check className="w-3 h-3" />
                                    Selecionado
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 text-slate-500 hover:text-slate-900 text-[11px] font-semibold">
                                    Escolher &rarr;
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-8 text-center text-slate-400 text-xs">
                          {repoSearch
                            ? `Nenhum repositório encontrado para "${repoSearch}".`
                            : 'Nenhum repositório localizado nesta conta.'}
                        </div>
                      )}
                    </div>
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
            {selectedRepo && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden space-y-4">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-900">
                      Configuração Automática de Build: {selectedRepo.name}
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
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-emerald-950 space-y-1">
                        <div className="font-bold flex items-center gap-2">
                          <span>Projeto analisado com sucesso!</span>
                          <span className="px-1.5 py-0.2 rounded bg-emerald-200/60 text-emerald-900 text-[10px]">
                            {inspectionResult.detectedType}
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-800">
                          {inspectionResult.hasDockerfile ? (
                            <>
                              Dockerfile detectado em{' '}
                              <code className="font-mono font-bold bg-white/70 px-1 py-0.2 rounded">
                                {inspectionResult.detectedDockerfile}
                              </code>{' '}
                              com porta sugerida <code className="font-bold">{internalPort}</code>.
                            </>
                          ) : (
                            <>
                              Nenhum Dockerfile encontrado na raiz. Será utilizado o caminho padrão{' '}
                              <code className="font-mono">Dockerfile</code>.
                            </>
                          )}
                        </p>
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
                      <select
                        value={selectedBranch}
                        onChange={(e) => handleBranchChange(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <optgroup label="Branches">
                          {branches.length > 0 ? (
                            branches.map((b) => (
                              <option key={b.name} value={b.name}>
                                {b.name} {b.name === selectedRepo.defaultBranch ? '⭐ (padrão)' : ''}
                              </option>
                            ))
                          ) : (
                            <option value={selectedBranch}>{selectedBranch}</option>
                          )}
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
                          : 'Ajustar Dockerfile, Contexto de Build e Variáveis de Ambiente'}
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Caminho do Dockerfile
                          </label>
                          <input
                            type="text"
                            value={dockerfilePath}
                            onChange={(e) => setDockerfilePath(e.target.value)}
                            placeholder="Dockerfile"
                            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

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
                        </div>
                      </div>

                      {/* PAT Token for Private Repos */}
                      {selectedRepo.private && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                            <Key className="w-3.5 h-3.5 text-amber-500" />
                            <span>Token GitHub PAT (Preenchido Automaticamente)</span>
                          </label>
                          <div className="relative">
                            <input
                              type={showToken ? 'text' : 'password'}
                              value={gitToken}
                              onChange={(e) => setGitToken(e.target.value)}
                              className="w-full pl-3 pr-10 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                            />
                            <button
                              type="button"
                              onClick={() => setShowToken(!showToken)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                            >
                              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Env Vars */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Variáveis de Ambiente (opcional)
                        </label>
                        <textarea
                          rows={3}
                          placeholder={`NODE_ENV=production\nPORT=3000\nDATABASE_URL=postgresql://...`}
                          value={envVars}
                          onChange={(e) => setEnvVars(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
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
