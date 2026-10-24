import React, { useState } from 'react';
import {
  Server,
  Plus,
  RefreshCw,
  Activity,
  Terminal,
  Cpu,
  HardDrive,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FolderGit2,
  Key,
  Shield,
  Radio,
  X,
  Play,
  Copy,
  ExternalLink,
} from 'lucide-react';
import type { Project, DockerHost } from '../../types';

interface ProjectHostsViewProps {
  projects: Project[];
  hosts: DockerHost[];
  selectedProjectId: string | null;
  onRefreshData: () => void;
  showNotification: (type: 'success' | 'error' | 'warning', title: string, message: string) => void;
}

export const ProjectHostsView: React.FC<ProjectHostsViewProps> = ({
  projects,
  hosts,
  selectedProjectId,
  onRefreshData,
  showNotification,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeHostTypeTab, setActiveHostTypeTab] = useState<'SSH' | 'LOCAL_SOCKET' | 'TCP_TLS' | 'EDGE_AGENT'>('SSH');

  // Form State
  const [name, setName] = useState('');
  const [targetProjectId, setTargetProjectId] = useState<string>(selectedProjectId || projects[0]?.id || '');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [sshUser, setSshUser] = useState('root');
  const [sshKey, setSshKey] = useState('');
  const [sshPassword, setSshPassword] = useState('');
  const [tlsCa, setTlsCa] = useState('');
  const [tlsCert, setTlsCert] = useState('');
  const [tlsKey, setTlsKey] = useState('');

  // Ping & Validation State
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latencyMs?: number;
    dockerVersion?: string;
    osInfo?: string;
    containersCount?: number;
    error?: string;
  } | null>(null);

  const [pingLoading, setPingLoading] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Filtra por projeto se selecionado
  const filteredHosts = selectedProjectId
    ? hosts.filter((h) => h.projectId === selectedProjectId)
    : hosts;

  const currentProject = projects.find((p) => p.id === selectedProjectId);

  const openAddModal = () => {
    setName('');
    setTargetProjectId(selectedProjectId || projects[0]?.id || '');
    setEndpointUrl('ssh://root@');
    setSshUser('root');
    setSshKey('');
    setSshPassword('');
    setActiveHostTypeTab('SSH');
    setTestResult(null);
    setIsAddModalOpen(true);
  };

  const handleTestConnection = async () => {
    if (!endpointUrl.trim()) {
      showNotification('warning', 'Campo Obrigatório', 'Informe o endpoint do servidor.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/hosts/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activeHostTypeTab,
          endpointUrl: endpointUrl.trim(),
          sshKey: sshKey.trim() || undefined,
          tlsCa: tlsCa.trim() || undefined,
          tlsCert: tlsCert.trim() || undefined,
          tlsKey: tlsKey.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao testar conexão.');

      setTestResult(data);
      if (data.success) {
        showNotification(
          'success',
          'Conexão Estabelecida!',
          `Docker ${data.dockerVersion || ''} respondeu com sucesso em ${data.latencyMs}ms.`
        );
      } else {
        showNotification('error', 'Falha na Conexão', data.error || 'Não foi possível alcançar o Docker daemon.');
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
      showNotification('error', 'Erro no Teste', err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveHost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showNotification('warning', 'Campo Obrigatório', 'Informe o nome do servidor.');
      return;
    }
    if (!targetProjectId) {
      showNotification('warning', 'Campo Obrigatório', 'Selecione um projeto para o servidor.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/hosts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          projectId: targetProjectId,
          type: activeHostTypeTab,
          endpointUrl: endpointUrl.trim(),
          sshUser: sshUser.trim() || undefined,
          sshKey: sshKey.trim() || undefined,
          sshPassword: sshPassword.trim() || undefined,
          tlsCa: tlsCa.trim() || undefined,
          tlsCert: tlsCert.trim() || undefined,
          tlsKey: tlsKey.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao cadastrar servidor.');
      }

      showNotification('success', 'Servidor Cadastrado', `O servidor "${name.trim()}" foi adicionado com sucesso.`);
      setIsAddModalOpen(false);
      onRefreshData();
    } catch (err: any) {
      showNotification('error', 'Erro ao Salvar', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePingHost = async (hostId: string) => {
    setPingLoading((prev) => ({ ...prev, [hostId]: true }));
    try {
      const res = await fetch(`/api/hosts/${hostId}/ping`, { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        showNotification(
          'success',
          'Servidor Online',
          `Ping concluído em ${data.latencyMs}ms. Versão: ${data.dockerVersion || 'Docker'}`
        );
      } else {
        showNotification('error', 'Servidor Inacessível', data.error || 'Erro ao conectar ao nó.');
      }
      onRefreshData();
    } catch (err: any) {
      showNotification('error', 'Falha no Ping', err.message);
    } finally {
      setPingLoading((prev) => ({ ...prev, [hostId]: false }));
    }
  };

  const handleDeleteHost = async (h: DockerHost) => {
    if (h.isDefault) {
      showNotification('warning', 'Ação Bloqueada', 'O servidor principal padrão não pode ser excluído.');
      return;
    }

    if (!confirm(`Tem certeza que deseja remover o servidor "${h.name}"?`)) return;

    try {
      const res = await fetch(`/api/hosts/${h.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao remover servidor.');
      }

      showNotification('success', 'Servidor Removido', `O servidor "${h.name}" foi removido com sucesso.`);
      onRefreshData();
    } catch (err: any) {
      showNotification('error', 'Erro ao Remover', err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-600" />
              <span>Servidores & Nós Docker</span>
            </h1>
            {currentProject && (
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                {currentProject.name}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gerencie múltiplos servidores Docker remotos (VPSs, Nuvem, Bare-Metal, Home Lab) sob este painel.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRefreshData}
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
            title="Atualizar Servidores"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Servidor</span>
          </button>
        </div>
      </div>

      {/* Grid de Servidores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredHosts.map((h) => {
          const isPingRunning = pingLoading[h.id];
          return (
            <div
              key={h.id}
              className="flex flex-col bg-white rounded-xl border border-slate-200 p-4 transition-all shadow-xs hover:border-slate-300"
            >
              {/* Header do Card */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      h.status === 'ONLINE'
                        ? 'bg-emerald-50 text-emerald-600'
                        : h.status === 'ERROR'
                        ? 'bg-rose-50 text-rose-600'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Server className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-sm text-slate-900 truncate" title={h.name}>
                      {h.name}
                    </h2>
                    <span className="text-[10px] text-slate-400 font-mono truncate block" title={h.endpointUrl}>
                      {h.endpointUrl}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border ${
                      h.status === 'ONLINE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : h.status === 'ERROR'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        h.status === 'ONLINE' ? 'bg-emerald-500' : h.status === 'ERROR' ? 'bg-rose-500' : 'bg-slate-400'
                      }`}
                    />
                    {h.status}
                  </span>

                  <span className="text-[9px] font-semibold text-slate-400 uppercase">
                    {h.type}
                  </span>
                </div>
              </div>

              {/* Badges de Projeto & Default */}
              <div className="flex items-center gap-1.5 flex-wrap my-1.5">
                {h.isDefault && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    Host Padrão
                  </span>
                )}
                {h.projectName && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-700">
                    <FolderGit2 className="w-2.5 h-2.5 text-slate-400" />
                    <span>{h.projectName}</span>
                  </span>
                )}
                {h.dockerVersion && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-slate-500 bg-slate-50 border border-slate-100">
                    v{h.dockerVersion}
                  </span>
                )}
              </div>

              {/* Informações de SO e Containers */}
              <div className="grid grid-cols-2 gap-2 py-2 px-3 bg-slate-50 rounded-lg text-xs my-2 border border-slate-100">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-medium">Containers</span>
                  <span className="font-bold text-slate-800 mt-0.5">
                    {h.containersCount ?? 0} ativos
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-medium">Sistema / SO</span>
                  <span className="font-semibold text-slate-700 truncate mt-0.5" title={h.osInfo || 'Linux'}>
                    {h.osInfo || 'Linux'}
                  </span>
                </div>
              </div>

              {h.errorMessage && (
                <div className="p-2 rounded bg-rose-50 border border-rose-100 text-[10px] text-rose-700 line-clamp-2 my-1">
                  {h.errorMessage}
                </div>
              )}

              {/* Rodapé */}
              <div className="pt-3 mt-auto border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-400">
                  {h.lastPingAt
                    ? `Ping: ${new Date(h.lastPingAt).toLocaleTimeString('pt-BR')}`
                    : 'Sem ping recente'}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePingHost(h.id)}
                    disabled={isPingRunning}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors disabled:opacity-50"
                    title="Testar Conectividade em Tempo Real"
                  >
                    <Activity className={`w-3 h-3 text-blue-600 ${isPingRunning ? 'animate-spin' : ''}`} />
                    <span>{isPingRunning ? 'Testando...' : 'Ping'}</span>
                  </button>

                  {!h.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleDeleteHost(h)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                      title="Remover Servidor"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredHosts.length === 0 && (
          <div className="col-span-full py-12 text-center bg-white rounded-xl border border-dashed border-slate-300 p-6">
            <Server className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-700">Nenhum servidor encontrado</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Adicione seu primeiro servidor remoto para conectar instâncias na nuvem ou na rede local.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Servidor</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal Adicionar Servidor */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-600" />
                <span>Adicionar Novo Servidor Docker</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tipo de Conexão Tabs */}
            <div className="flex border-b border-slate-100 bg-slate-50 px-4 pt-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveHostTypeTab('SSH');
                  setEndpointUrl('ssh://root@');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-1.5 ${
                  activeHostTypeTab === 'SSH'
                    ? 'bg-white text-blue-600 border-t border-x border-slate-200 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>SSH Direto (VPS / Nuvem)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveHostTypeTab('LOCAL_SOCKET');
                  setEndpointUrl('/var/run/docker.sock');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-1.5 ${
                  activeHostTypeTab === 'LOCAL_SOCKET'
                    ? 'bg-white text-blue-600 border-t border-x border-slate-200 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Docker Socket Local</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveHostTypeTab('TCP_TLS');
                  setEndpointUrl('tcp://');
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-1.5 ${
                  activeHostTypeTab === 'TCP_TLS'
                    ? 'bg-white text-blue-600 border-t border-x border-slate-200 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>TCP / TLS</span>
              </button>
            </div>

            <form onSubmit={handleSaveHost} className="p-4 space-y-3.5 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Nome de Identificação *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: VPS Hetzner Prod, AWS EC2"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Vincular ao Projeto *
                  </label>
                  <select
                    value={targetProjectId}
                    onChange={(e) => setTargetProjectId(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                    required
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {activeHostTypeTab === 'SSH'
                    ? 'Endereço SSH do Servidor *'
                    : activeHostTypeTab === 'TCP_TLS'
                    ? 'URL TCP do Docker (porta 2376) *'
                    : 'Caminho do Socket Docker *'}
                </label>
                <input
                  type="text"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder={
                    activeHostTypeTab === 'SSH'
                      ? 'ssh://root@192.168.0.7:22'
                      : activeHostTypeTab === 'TCP_TLS'
                      ? 'tcp://192.168.0.7:2376'
                      : '/var/run/docker.sock'
                  }
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {activeHostTypeTab === 'SSH' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Chave Privada SSH (Opcional se já estiver configurada no agente/host)
                  </label>
                  <textarea
                    value={sshKey}
                    onChange={(e) => setSshKey(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                    rows={4}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-[11px]"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Se omitida, a autenticação usará as chaves SSH padrões do sistema.
                  </p>
                </div>
              )}

              {/* Botão de Teste de Conexão em Tempo Real */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"
                >
                  <Activity className={`w-3.5 h-3.5 text-blue-600 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'Testando Conexão...' : 'Testar Conexão em Tempo Real'}</span>
                </button>

                {testResult && (
                  <div
                    className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                      testResult.success ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {testResult.success ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Online ({testResult.latencyMs}ms) • Docker v{testResult.dockerVersion}</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Erro: {testResult.error || 'Falha'}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Rodapé com Salvar */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs disabled:opacity-50"
                >
                  {isSaving ? 'Salvando...' : 'Salvar Servidor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
