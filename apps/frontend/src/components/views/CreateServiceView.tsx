import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import type { Service } from '../../types/index.ts';
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
  const { showNotification } = useNotification();

  // Basic
  const [name, setName] = useState('');
  const [containerName, setContainerName] = useState('');
  const [internalPort, setInternalPort] = useState<number | ''>(80);
  const [notes, setNotes] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  // Source type
  const [sourceType, setSourceType] = useState<'IMAGE' | 'GITHUB'>('IMAGE');

  // Image source
  const [image, setImage] = useState('');

  // GitHub source
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [dockerfilePath, setDockerfilePath] = useState('Dockerfile');
  const [buildContext, setBuildContext] = useState('.');
  const [gitToken, setGitToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [triggerInitialBuild, setTriggerInitialBuild] = useState(true);
  const [envVars, setEnvVars] = useState('');

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setImage(preset.image);
    setInternalPort(preset.port);
    if (!name) {
      const n = preset.label;
      setName(n);
      setContainerName(n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, ''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('O nome de identificação é obrigatório.'); return; }
    if (!containerName.trim()) { setError('O nome do container Docker é obrigatório.'); return; }
    if (!internalPort || Number(internalPort) < 1 || Number(internalPort) > 65535) {
      setError('A porta interna deve estar entre 1 e 65535.');
      return;
    }
    if (sourceType === 'GITHUB' && !gitRepoUrl.trim()) {
      setError('A URL do repositório GitHub é obrigatória.');
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
        gitBranch: gitBranch.trim() || 'main',
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
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
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
            Cadastrar Novo Serviço Docker
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Registre um container Docker existente ou configure um pipeline de build a partir de um repositório GitHub.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Error Banner */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Section: Source Type */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
            <h2 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-blue-600" />
              Origem da Aplicação
            </h2>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  {sourceType === 'IMAGE' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 ml-auto" />}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  Container rodando uma imagem pré-construída (ex: <code className="font-mono">nginx:alpine</code>, <code className="font-mono">postgres:16</code>).
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
                  {sourceType === 'GITHUB' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 ml-auto" />}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  Clona o repositório, constrói via Dockerfile e faz deploy automático a cada push.
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Section: Basic Info */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
            <h2 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-600" />
              Identificação do Serviço
            </h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome de Identificação <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: API Backend Principal"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">Nome amigável exibido no painel.</p>
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
                <p className="text-[11px] text-slate-400 mt-1">Nome na rede Docker interna (proxy-net).</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Porta Interna <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={65535}
                  placeholder="80, 3000, 8080..."
                  value={internalPort}
                  onChange={(e) => setInternalPort(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-bold"
                />
                <p className="text-[11px] text-slate-400 mt-1">Porta onde o app escuta.</p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notas Operacionais (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Serviço principal de autenticação, responsável: time de backend"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section: Image Config (IMAGE mode) */}
        {sourceType === 'IMAGE' && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
              <h2 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-blue-600" />
                Imagem Docker
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
                <p className="text-[11px] text-slate-400 mt-1">Imagem pública ou privada do Docker Hub ou registry particular.</p>
              </div>
            </div>
          </div>
        )}

        {/* Section: GitHub Config (GITHUB mode) */}
        {sourceType === 'GITHUB' && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-blue-600" />
                Configurações do Repositório GitHub
              </h2>
              <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">CI/CD Pipeline</span>
            </div>
            <div className="p-5 space-y-4">
              {/* Repo URL + Branch */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    URL do Repositório <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required={sourceType === 'GITHUB'}
                    placeholder="https://github.com/usuario/meu-projeto.git"
                    value={gitRepoUrl}
                    onChange={(e) => setGitRepoUrl(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">URL HTTPS do repositório público ou privado.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Branch de Deploy</label>
                  <input
                    type="text"
                    placeholder="main"
                    value={gitBranch}
                    onChange={(e) => setGitBranch(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Branch monitorado para deploy.</p>
                </div>
              </div>

              {/* Dockerfile + Build Context */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Caminho do Dockerfile</label>
                  <input
                    type="text"
                    placeholder="Dockerfile"
                    value={dockerfilePath}
                    onChange={(e) => setDockerfilePath(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Caminho relativo do Dockerfile (padrão: <code className="font-mono">Dockerfile</code>).</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Contexto do Build</label>
                  <input
                    type="text"
                    placeholder=". ou apps/backend"
                    value={buildContext}
                    onChange={(e) => setBuildContext(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Útil para monorepos (padrão: <code className="font-mono">.</code>).</p>
                </div>
              </div>

              {/* PAT Token */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Key className="w-3 h-3 text-amber-500" />
                  <span>Token GitHub PAT</span>
                  <span className="text-[10px] font-normal text-slate-400 ml-auto">Opcional — apenas repositórios privados</span>
                </label>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={gitToken}
                    onChange={(e) => setGitToken(e.target.value)}
                    className="w-full pl-3 pr-10 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Armazenado com segurança e mascarado nos logs de compilação.</p>
              </div>

              {/* Env Vars */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Variáveis de Ambiente (opcional)</label>
                <textarea
                  rows={3}
                  placeholder={`NODE_ENV=production\nPORT=3000\nDATABASE_URL=postgresql://...`}
                  value={envVars}
                  onChange={(e) => setEnvVars(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
                <p className="text-[11px] text-slate-400 mt-1">Uma variável por linha no formato <code className="font-mono">CHAVE=VALOR</code>.</p>
              </div>

              {/* Initial build checkbox */}
              <div className="flex items-start gap-3 p-3.5 bg-blue-50 border border-blue-100 rounded-xl">
                <input
                  type="checkbox"
                  id="triggerBuild"
                  checked={triggerInitialBuild}
                  onChange={(e) => setTriggerInitialBuild(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <label htmlFor="triggerBuild" className="cursor-pointer select-none">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Play className="w-3 h-3 text-blue-600" />
                    Executar build inicial imediatamente após cadastrar
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    O Worker clonará o repositório e compilará a imagem Docker automaticamente ao salvar.
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Section: Options */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
            <h2 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              Opções de Roteamento
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
                <span className="text-xs font-bold text-slate-900 block">Definir como Serviço Padrão (Catch-All)</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Recebe requisições de domínios apontados para este servidor que não estejam cadastrados explicitamente.
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Submit */}
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
            disabled={isSubmitting}
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
