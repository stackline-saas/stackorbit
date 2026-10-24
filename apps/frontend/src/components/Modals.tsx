import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Terminal, AlertTriangle, RefreshCw } from 'lucide-react';
import type { Service, Domain } from '../types/index.ts';

// ============================================================================
// SERVICE MODAL (CREATE / EDIT)
// ============================================================================
interface ServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (serviceData: Partial<Service>) => Promise<boolean>;
  service?: Service | null;
}

export const ServiceModal: React.FC<ServiceModalProps> = ({
  isOpen,
  onClose,
  onSave,
  service,
}) => {
  const [name, setName] = useState('');
  const [containerName, setContainerName] = useState('');
  const [sourceType, setSourceType] = useState<'IMAGE' | 'GITHUB'>('IMAGE');
  const [image, setImage] = useState('');
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [dockerfilePath, setDockerfilePath] = useState('Dockerfile');
  const [envVars, setEnvVars] = useState('');
  const [internalPort, setInternalPort] = useState(80);
  const [notes, setNotes] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (service) {
      setName(service.name);
      setContainerName(service.containerName);
      setSourceType(service.sourceType || 'IMAGE');
      setImage(service.image || 'app:latest');
      setGitRepoUrl(service.gitRepoUrl || '');
      setGitBranch(service.gitBranch || 'main');
      setDockerfilePath(service.dockerfilePath || 'Dockerfile');
      setEnvVars(service.envVars || '');
      setInternalPort(service.internalPort || 80);
      setNotes(service.notes || '');
      setIsDefault(Boolean(service.isDefault));
    } else {
      setName('');
      setContainerName('');
      setSourceType('IMAGE');
      setImage('node:20-alpine');
      setGitRepoUrl('https://github.com/usuario/meu-projeto.git');
      setGitBranch('main');
      setDockerfilePath('Dockerfile');
      setEnvVars('');
      setInternalPort(80);
      setNotes('');
      setIsDefault(false);
    }
    setError(null);
  }, [service, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('O nome do serviço é obrigatório.');
      return;
    }
    if (!containerName.trim()) {
      setError('O nome ou ID do container Docker é obrigatório.');
      return;
    }
    if (sourceType === 'GITHUB' && !gitRepoUrl.trim()) {
      setError('A URL do repositório GitHub é obrigatória.');
      return;
    }
    if (!internalPort || internalPort < 1 || internalPort > 65535) {
      setError('A porta interna deve estar entre 1 e 65535.');
      return;
    }

    setIsSubmitting(true);
    const success = await onSave({
      name: name.trim(),
      containerName: containerName.trim(),
      sourceType,
      image: sourceType === 'GITHUB' ? `${containerName.trim()}:latest` : image.trim(),
      gitRepoUrl: sourceType === 'GITHUB' ? gitRepoUrl.trim() : undefined,
      gitBranch: sourceType === 'GITHUB' ? (gitBranch.trim() || 'main') : undefined,
      dockerfilePath: sourceType === 'GITHUB' ? (dockerfilePath.trim() || 'Dockerfile') : undefined,
      envVars: sourceType === 'GITHUB' ? envVars : undefined,
      internalPort: Number(internalPort),
      notes: notes.trim(),
      isDefault,
    });
    setIsSubmitting(false);

    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="text-sm font-bold">
            {service ? 'Editar Serviço Docker' : 'Cadastrar Novo Serviço'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xs">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nome de Identificação</label>
            <input
              type="text"
              required
              placeholder="Ex: API Backend, Admin Panel, Microsserviço Auth"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            />
          </div>

          {/* Origem do Serviço: Imagem ou GitHub */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Origem da Aplicação</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setSourceType('IMAGE')}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                  sourceType === 'IMAGE'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Imagem Docker Existente
              </button>
              <button
                type="button"
                onClick={() => setSourceType('GITHUB')}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                  sourceType === 'GITHUB'
                    ? 'bg-white text-blue-600 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Repositório GitHub (CI/CD)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome do Container no Docker
              </label>
              <input
                type="text"
                required
                placeholder="Ex: api, admin, auth_svc"
                value={containerName}
                onChange={(e) => setContainerName(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
              />
              <span className="text-[10px] text-slate-400">Nome na rede Docker [proxy-net]</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Porta Interna</label>
              <input
                type="number"
                required
                min={1}
                max={65535}
                placeholder="80, 8080, 3000"
                value={internalPort}
                onChange={(e) => setInternalPort(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
              />
              <span className="text-[10px] text-slate-400">Porta onde o container escuta</span>
            </div>
          </div>

          {sourceType === 'IMAGE' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Imagem Docker</label>
              <input
                type="text"
                placeholder="Ex: node:20-alpine, nginx:alpine"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
              />
              <span className="text-[10px] text-slate-400">Imagem no Docker Hub ou Registry privado</span>
            </div>
          ) : (
            <div className="space-y-3 p-3.5 rounded-lg bg-blue-50/50 border border-blue-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-950">Configurações do GitHub</span>
                <span className="text-[10px] text-blue-700 font-semibold bg-blue-100 px-1.5 py-0.2 rounded">
                  Build Automatizado
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">URL do Repositório Git</label>
                <input
                  type="text"
                  required
                  placeholder="https://github.com/usuario/repositorio.git"
                  value={gitRepoUrl}
                  onChange={(e) => setGitRepoUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Branch</label>
                  <input
                    type="text"
                    required
                    placeholder="main, master, prod"
                    value={gitBranch}
                    onChange={(e) => setGitBranch(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Caminho do Dockerfile</label>
                  <input
                    type="text"
                    required
                    placeholder="Dockerfile ou docker/Dockerfile"
                    value={dockerfilePath}
                    onChange={(e) => setDockerfilePath(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Variáveis de Ambiente (opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="CHAVE=VALOR&#10;NODE_ENV=production"
                  value={envVars}
                  onChange={(e) => setEnvVars(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Observações (opcional)</label>
            <textarea
              rows={2}
              placeholder="Notas internas da equipe..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            />
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="text-xs text-slate-700 font-medium">
                Definir como Serviço Padrão (Catch-all)
              </span>
            </label>
          </div>

          <div className="pt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-md border border-slate-200 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : service ? 'Salvar Alterações' : 'Criar Serviço'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// DOMAIN MODAL (CREATE / EDIT)
// ============================================================================
interface DomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (domainData: {
    domainName: string;
    serviceId: string;
    isActive?: boolean;
    targetContainer?: string;
    targetPort?: number;
  }) => Promise<boolean>;
  services: Service[];
  domain?: Domain | null;
}

export const DomainModal: React.FC<DomainModalProps> = ({
  isOpen,
  onClose,
  onSave,
  services,
  domain,
}) => {
  const [domainName, setDomainName] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [targetContainer, setTargetContainer] = useState('');
  const [targetPort, setTargetPort] = useState<number | ''>('');
  const [serviceContainers, setServiceContainers] = useState<any[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load stack containers for selected service
  useEffect(() => {
    if (!serviceId) {
      setServiceContainers([]);
      return;
    }
    const token = localStorage.getItem('dm_auth_token') || '';
    fetch(`/api/services/${serviceId}/containers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.containers) {
          setServiceContainers(data.containers);
        } else {
          setServiceContainers([]);
        }
      })
      .catch(() => setServiceContainers([]));
  }, [serviceId]);

  useEffect(() => {
    if (domain) {
      setDomainName(domain.domainName);
      setServiceId(domain.serviceId);
      setTargetContainer(domain.targetContainer || '');
      setTargetPort(domain.targetPort || '');
      setIsActive(domain.isActive);
    } else {
      setDomainName('');
      const defaultSvc = services[0];
      setServiceId(defaultSvc?.id || '');
      setTargetContainer(defaultSvc?.containerName || '');
      setTargetPort(defaultSvc?.internalPort || 80);
      setIsActive(true);
    }
    setError(null);
    setValidationMessage(null);
  }, [domain, isOpen, services]);

  if (!isOpen) return null;

  // Real-time domain format check
  const handleDomainBlur = async () => {
    if (!domainName.trim()) return;
    setIsValidating(true);
    try {
      const res = await fetch('/api/domains/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
        },
        body: JSON.stringify({ domainName: domainName.trim(), excludeId: domain?.id }),
      });
      const data = await res.json();
      if (!data.valid) {
        setValidationMessage(data.reason);
      } else {
        setValidationMessage(null);
      }
    } catch {
      // Ignora erro de rede na validação prévia
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!domainName.trim()) {
      setError('O nome do domínio é obrigatório.');
      return;
    }
    if (!serviceId) {
      setError('Selecione um serviço de destino.');
      return;
    }

    setIsSubmitting(true);
    const success = await onSave({
      domainName: domainName.trim(),
      serviceId,
      targetContainer: targetContainer || undefined,
      targetPort: targetPort ? Number(targetPort) : undefined,
      isActive,
    });
    setIsSubmitting(false);

    if (success) {
      onClose();
    }
  };

  const selectedService = services.find((s) => s.id === serviceId);
  const resolvedTargetContainer = targetContainer || selectedService?.containerName || '';
  const resolvedTargetPort = targetPort || selectedService?.internalPort || 80;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="text-sm font-bold">
            {domain ? 'Editar Domínio' : 'Associar Novo Domínio a Serviço'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xs">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {(error || validationMessage) && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error || validationMessage}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">Nome do Domínio (FQDN)</label>
              {isValidating && <span className="text-[10px] text-slate-400">Verificando...</span>}
            </div>
            <input
              type="text"
              required
              placeholder="Ex: api.bla.com.br ou admin.bla.com.br"
              value={domainName}
              onChange={(e) => {
                setDomainName(e.target.value);
                setValidationMessage(null);
              }}
              onBlur={handleDomainBlur}
              className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            />
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>
                Regra Traefik: <code className="font-mono text-slate-700">Host(`{domainName || 'exemplo.com'}`)</code>
              </span>
              <span className="text-indigo-600 font-medium">
                Aceita domínios de clientes externos
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Serviço / Stack</label>
            <select
              required
              value={serviceId}
              onChange={(e) => {
                const sId = e.target.value;
                setServiceId(sId);
                const s = services.find((item) => item.id === sId);
                if (s) {
                  setTargetContainer(s.containerName);
                  setTargetPort(s.internalPort);
                }
              }}
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white"
            >
              {services.length === 0 ? (
                <option value="">Nenhum serviço cadastrado</option>
              ) : (
                services.map((svc) => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name} {svc.containerCount && svc.containerCount > 1 ? `(${svc.containerCount} containers)` : `(${svc.containerName}:${svc.internalPort})`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Specific Stack Container & Port Selector */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Container de Destino na Stack
              </label>
              <select
                value={resolvedTargetContainer}
                onChange={(e) => {
                  const cName = e.target.value;
                  setTargetContainer(cName);
                  const chosen = serviceContainers.find((c) => c.name === cName);
                  const p = chosen?.ports?.find((port: any) => port.privatePort)?.privatePort;
                  if (p) setTargetPort(p);
                }}
                className="w-full px-3 py-2 text-xs font-mono rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 bg-white"
              >
                {serviceContainers.length > 0 ? (
                  serviceContainers.map((c) => (
                    <option key={c.id || c.name} value={c.name}>
                      {c.name} {c.composeService ? `(${c.composeService})` : ''} {c.isPrimary ? '⭐' : ''}
                    </option>
                  ))
                ) : (
                  <option value={selectedService?.containerName || ''}>
                    {selectedService?.containerName || 'Container Padrão'}
                  </option>
                )}
              </select>
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
                value={resolvedTargetPort}
                onChange={(e) => setTargetPort(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono font-bold rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 text-center"
              />
            </div>
          </div>

          {selectedService && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
              <p className="font-semibold text-slate-900 mb-1">Resumo do Encaminhamento Traefik:</p>
              <div className="font-mono text-[11px] text-slate-700 space-y-0.5">
                <div>Domínio: <span className="text-blue-600 font-bold">{domainName || '(não definido)'}</span></div>
                <div>Container Destino: <span className="text-emerald-700 font-bold">{resolvedTargetContainer}:{resolvedTargetPort}</span></div>
                <div>SSL: <span className="text-slate-600">Cloudflare Proxy (Full strict)</span></div>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="text-xs text-slate-700 font-medium">
                Ativar roteamento imediatamente no Traefik
              </span>
            </label>
          </div>

          <div className="pt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-md border border-slate-200 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : domain ? 'Salvar Alterações' : 'Cadastrar Domínio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// LOGS MODAL (CONTAINER REAL-TIME LOGS)
// ============================================================================
interface LogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  containerName: string;
}

export const LogsModal: React.FC<LogsModalProps> = ({ isOpen, onClose, containerName }) => {
  const [logs, setLogs] = useState<string>('Carregando logs do container...');
  const [tail, setTail] = useState<number>(100);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchLogs = async () => {
    if (!containerName) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/containers/${encodeURIComponent(containerName)}/logs?tail=${tail}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || 'Nenhum log registrado para este container.');
      } else {
        setLogs('Erro ao obter logs do Docker Socket.');
      }
    } catch (err: any) {
      setLogs(`Falha na conexão: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && containerName) {
      fetchLogs();
    }
  }, [isOpen, containerName, tail]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(logs);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-slate-900 rounded-xl shadow-2xl border border-slate-800 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden text-slate-100">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold font-mono">
              Logs do Container: <span className="text-emerald-400">{containerName}</span>
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={tail}
              onChange={(e) => setTail(Number(e.target.value))}
              className="bg-slate-800 text-xs text-slate-300 rounded px-2 py-1 border border-slate-700"
            >
              <option value={50}>Últimas 50 linhas</option>
              <option value={100}>Últimas 100 linhas</option>
              <option value={200}>Últimas 200 linhas</option>
            </select>
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 hover:text-white"
              title="Recarregar logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs rounded text-slate-300 flex items-center gap-1"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xs pl-2">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed bg-black/60 select-text">
          <pre className="whitespace-pre-wrap break-all">{logs}</pre>
        </div>

        <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Docker Engine Engine Socket: /var/run/docker.sock</span>
          <span>Saída STDOUT / STDERR</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// CONFIRM DELETE MODAL
// ============================================================================
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Excluir',
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    await onConfirm();
    setIsDeleting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
        <div className="p-6">
          <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">{title}</h3>
          <p className="text-xs text-slate-600 leading-relaxed">{description}</p>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-md border border-slate-200 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={isDeleting}
              className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-md transition-colors disabled:opacity-50"
            >
              {isDeleting ? 'Processando...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// BUILD LOGS & GITHUB CI/CD MODAL
// ============================================================================
interface BuildLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: Service | null;
  onTriggerRebuild: (serviceId: string) => Promise<void>;
  isRebuilding: boolean;
}

export const BuildLogsModal: React.FC<BuildLogsModalProps> = ({
  isOpen,
  onClose,
  service,
  onTriggerRebuild,
  isRebuilding,
}) => {
  const [activeTab, setActiveTab] = useState<'logs' | 'webhook'>('logs');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);

  if (!isOpen || !service) return null;

  const webhookUrl = `${window.location.origin}/api/webhooks/github/${service.id}`;

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(service.buildLogs || '');
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const handleCopyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(service.webhookSecret || '');
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-slate-900 rounded-xl shadow-2xl border border-slate-800 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/30 text-blue-400 flex items-center justify-center">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Pipeline de Build: {service.name}</h3>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.2 rounded ${
                    service.buildStatus === 'building' || isRebuilding
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : service.buildStatus === 'success'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {service.buildStatus === 'building' || isRebuilding
                    ? 'CONSTRUINDO...'
                    : service.buildStatus === 'success'
                    ? 'SUCESSO'
                    : 'FALHOU'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                {service.gitRepoUrl || 'Git'} @ <span className="text-blue-400">{service.gitBranch || 'main'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onTriggerRebuild(service.id)}
              disabled={isRebuilding || service.buildStatus === 'building'}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRebuilding ? 'animate-spin' : ''}`} />
              <span>{isRebuilding ? 'Compilando...' : 'Reconstruir do GitHub'}</span>
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xs pl-2">
              ✕
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="px-6 py-2 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === 'logs'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Logs de Build (Docker Build)
            </button>
            <button
              onClick={() => setActiveTab('webhook')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === 'webhook'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Webhook GitHub (Push-to-Deploy)
            </button>
          </div>

          {activeTab === 'logs' && (
            <button
              onClick={handleCopyLogs}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs rounded text-slate-300 flex items-center gap-1"
            >
              {copiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLogs ? 'Copiado' : 'Copiar Logs'}</span>
            </button>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'logs' ? (
          <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-slate-200 leading-relaxed bg-black/60 select-text">
            <pre className="whitespace-pre-wrap break-all">
              {service.buildLogs || 'Nenhum log de build disponível ainda. Clique em "Reconstruir do GitHub" para iniciar.'}
            </pre>
          </div>
        ) : (
          <div className="flex-1 p-6 overflow-y-auto space-y-5 bg-slate-950 text-slate-200 text-xs">
            <div>
              <h4 className="font-bold text-sm text-white mb-1">
                Configuração de Continuous Deployment (Push-to-Deploy)
              </h4>
              <p className="text-slate-400 leading-relaxed">
                Configure um Webhook no repositório GitHub para que qualquer <code className="text-blue-400">git push</code> na
                branch <strong>{service.gitBranch || 'main'}</strong> acione automaticamente o clone, a construção da imagem Docker e
                a republicação do container no Traefik com zero intervenção manual.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Payload URL (Cole no GitHub)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded font-mono text-xs text-blue-400"
                  />
                  <button
                    onClick={handleCopyWebhookUrl}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs text-white flex items-center gap-1 shrink-0 font-medium"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Secret Token (Opcional para validação de assinatura)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={service.webhookSecret || 'whsec_github'}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded font-mono text-xs text-amber-400"
                  />
                  <button
                    onClick={handleCopySecret}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs text-white flex items-center gap-1 shrink-0 font-medium"
                  >
                    {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSecret ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
              <span className="font-bold text-white block">Instruções no GitHub:</span>
              <ol className="list-decimal list-inside space-y-1 text-slate-300 text-xs">
                <li>No GitHub, acesse <strong>Settings &gt; Webhooks &gt; Add webhook</strong>.</li>
                <li>Cole a <strong>Payload URL</strong> acima.</li>
                <li>Defina o <strong>Content type</strong> como <code className="text-amber-400">application/json</code>.</li>
                <li>Cole o <strong>Secret Token</strong>.</li>
                <li>Selecione <strong>"Just the push event"</strong> e clique em <strong>Add webhook</strong>.</li>
              </ol>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-2.5 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Último build: {service.lastBuiltAt ? new Date(service.lastBuiltAt).toLocaleString('pt-BR') : 'Nunca'}</span>
          <span>Docker Engine / BuildKit via Unix Socket</span>
        </div>
      </div>
    </div>
  );
};
