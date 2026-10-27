import React, { useState, useEffect } from 'react';
import {
  Zap,
  Search,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Terminal,
  Activity,
  HardDrive,
  Users,
  Clock,
  Key,
  Copy,
  Check,
  AlertCircle,
  Hash,
  List,
  Layers,
} from 'lucide-react';
import type { RedisKeyInfo, RedisServerMetrics } from '../types/index.ts';

interface RedisStudioViewProps {
  serviceId: string;
  serviceName: string;
}

export const RedisStudioView: React.FC<RedisStudioViewProps> = ({ serviceId, serviceName }) => {
  const [metrics, setMetrics] = useState<RedisServerMetrics | null>(null);
  const [keys, setKeys] = useState<RedisKeyInfo[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [keyDetail, setKeyDetail] = useState<RedisKeyInfo | null>(null);
  const [searchPattern, setSearchPattern] = useState('*');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edição
  const [editValue, setEditValue] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Modal Nova Chave
  const [isNewKeyModalOpen, setIsNewKeyModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyType, setNewKeyType] = useState<'string' | 'hash'>('string');
  const [newKeyTTL, setNewKeyTTL] = useState<string>('');
  const [newKeyHashField, setNewKeyHashField] = useState('');

  // Terminal Redis CLI
  const [cliCommand, setCliCommand] = useState('');
  const [cliHistory, setCliHistory] = useState<Array<{ cmd: string; res: any }>>([
    { cmd: 'PING', res: 'PONG' },
  ]);
  const [isCliLoading, setIsCliLoading] = useState(false);

  // Carrega métricas e chaves
  const loadMetrics = async () => {
    try {
      const res = await fetch(`/api/databases/${serviceId}/redis/metrics`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });
      if (res.ok) setMetrics(await res.json());
    } catch {}
  };

  const loadKeys = async (pat: string = searchPattern) => {
    setIsLoadingKeys(true);
    setError(null);
    try {
      const res = await fetch(`/api/databases/${serviceId}/redis/keys?pattern=${encodeURIComponent(pat)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(data || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingKeys(false);
    }
  };

  useEffect(() => {
    if (serviceId) {
      loadMetrics();
      loadKeys();
    }
  }, [serviceId]);

  // Carrega detalhes da chave selecionada
  const handleSelectKey = async (keyName: string) => {
    setSelectedKey(keyName);
    setIsLoadingDetail(true);
    try {
      const res = await fetch(`/api/databases/${serviceId}/redis/key?key=${encodeURIComponent(keyName)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });
      if (res.ok) {
        const detail = await res.json();
        setKeyDetail(detail);
        if (detail.type === 'string') {
          setEditValue(detail.value || '');
        } else if (detail.type === 'hash') {
          setEditValue(JSON.stringify(detail.value, null, 2));
        } else {
          setEditValue(JSON.stringify(detail.value, null, 2));
        }
      }
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Salvar alteração de chave
  const handleSaveKey = async () => {
    if (!selectedKey) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/databases/${serviceId}/redis/key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
        },
        body: JSON.stringify({
          key: selectedKey,
          value: editValue,
          type: keyDetail?.type || 'string',
        }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        handleSelectKey(selectedKey);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Excluir chave
  const handleDeleteKey = async (keyName: string) => {
    if (!window.confirm(`Deseja excluir a chave "${keyName}" do Redis?`)) return;
    try {
      const res = await fetch(`/api/databases/${serviceId}/redis/key?key=${encodeURIComponent(keyName)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });
      if (res.ok) {
        setSelectedKey(null);
        setKeyDetail(null);
        loadKeys();
        loadMetrics();
      }
    } catch {}
  };

  // Criar nova chave
  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    try {
      const res = await fetch(`/api/databases/${serviceId}/redis/key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
        },
        body: JSON.stringify({
          key: newKeyName.trim(),
          value: newKeyValue,
          type: newKeyType,
          ttl: newKeyTTL ? parseInt(newKeyTTL, 10) : undefined,
          hashField: newKeyType === 'hash' ? newKeyHashField || 'field1' : undefined,
        }),
      });

      if (res.ok) {
        setIsNewKeyModalOpen(false);
        setNewKeyName('');
        setNewKeyValue('');
        loadKeys();
        handleSelectKey(newKeyName.trim());
      }
    } catch {}
  };

  // Executar comando CLI
  const handleRunCli = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliCommand.trim()) return;

    const cmd = cliCommand.trim();
    setIsCliLoading(true);

    try {
      const res = await fetch(`/api/databases/${serviceId}/redis/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
        },
        body: JSON.stringify({ command: cmd }),
      });

      const data = await res.json();
      setCliHistory((prev) => [...prev, { cmd, res: data.output || data.error || data }]);
      setCliCommand('');
    } finally {
      setIsCliLoading(false);
    }
  };

  const filteredKeys = keys.filter((k) => {
    if (typeFilter !== 'all' && k.type !== typeFilter) return false;
    return true;
  });

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'string':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'hash':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'list':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'set':
      case 'zset':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Metrics Bar */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
            <span className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1.5 mb-1">
              <HardDrive className="w-3.5 h-3.5 text-blue-400" /> Memória Usada
            </span>
            <span className="text-base font-bold text-slate-100 font-mono">{metrics.usedMemoryHuman}</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
            <span className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1.5 mb-1">
              <Activity className="w-3.5 h-3.5 text-purple-400" /> Pico Memória
            </span>
            <span className="text-base font-bold text-slate-100 font-mono">{metrics.usedMemoryPeakHuman}</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
            <span className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1.5 mb-1">
              <Key className="w-3.5 h-3.5 text-amber-400" /> Total Chaves
            </span>
            <span className="text-base font-bold text-slate-100 font-mono">{metrics.totalKeys}</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
            <span className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1.5 mb-1">
              <Users className="w-3.5 h-3.5 text-emerald-400" /> Clientes Ativos
            </span>
            <span className="text-base font-bold text-slate-100 font-mono">{metrics.connectedClients}</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
            <span className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-yellow-400" /> Comandos/seg
            </span>
            <span className="text-base font-bold text-slate-100 font-mono">{metrics.opsPerSec} ops</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
            <span className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> Versão
            </span>
            <span className="text-base font-bold text-slate-100 font-mono">{metrics.redisVersion}</span>
          </div>
        </div>
      )}

      {/* Main Studio Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[650px]">
        {/* Left Panel: Key Browser (4 cols) */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col overflow-hidden">
          {/* Header & New Key Button */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-red-500" />
              <span className="font-bold text-slate-100 text-xs">Chaves do Redis</span>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded-md">
                {filteredKeys.length}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => loadKeys()}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                title="Recarregar chaves"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingKeys ? 'animate-spin text-red-400' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setIsNewKeyModalOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova</span>
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchPattern}
              onChange={(e) => setSearchPattern(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadKeys()}
              placeholder="Padrão: * ou bull:*"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 text-slate-200 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
            />
          </div>

          {/* Type Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-2 text-[10px]">
            {['all', 'string', 'hash', 'list', 'set', 'zset'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-2 py-0.5 rounded-lg font-bold uppercase transition-colors shrink-0 ${
                  typeFilter === t
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Keys List */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 font-mono text-xs">
            {isLoadingKeys ? (
              <div className="py-12 text-center text-slate-500">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-red-500" />
                <span>Buscando chaves...</span>
              </div>
            ) : filteredKeys.length === 0 ? (
              <div className="py-12 text-center text-slate-500">Nenhuma chave encontrada.</div>
            ) : (
              filteredKeys.map((k) => (
                <div
                  key={k.key}
                  onClick={() => handleSelectKey(k.key)}
                  className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                    selectedKey === k.key
                      ? 'bg-red-500/15 border border-red-500/30 text-slate-100'
                      : 'hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <span className="truncate pr-2">{k.key}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${getTypeBadge(k.type)}`}>
                      {k.type}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {k.ttl === -1 ? '∞' : `${k.ttl}s`}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Key Inspector & Editor (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col overflow-hidden">
          {selectedKey && keyDetail ? (
            <>
              {/* Key Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-3 truncate">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg uppercase border ${getTypeBadge(keyDetail.type)}`}>
                    {keyDetail.type}
                  </span>
                  <span className="font-bold text-slate-100 text-sm font-mono truncate">{selectedKey}</span>
                  <span className="text-xs text-slate-400 font-mono">
                    TTL: {keyDetail.ttl === -1 ? 'Persistente (Sem expiração)' : `${keyDetail.ttl} segundos restantes`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveKey}
                    disabled={isSaving}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      saveSuccess
                        ? 'bg-emerald-600 text-white'
                        : 'bg-red-600 hover:bg-red-500 text-white'
                    }`}
                  >
                    {saveSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{saveSuccess ? 'Salvo!' : 'Salvar Valor'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteKey(selectedKey)}
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-colors"
                    title="Excluir chave"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Value Editor Area */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  spellCheck={false}
                  className="w-full flex-1 p-4 bg-slate-950 text-slate-200 border border-slate-800 rounded-2xl resize-none outline-none font-mono text-xs leading-relaxed"
                  placeholder="Valor da chave..."
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <Zap className="w-10 h-10 mb-2 opacity-30 text-red-500" />
              <p className="text-xs font-semibold">Selecione uma chave à esquerda para inspecionar e editar</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Panel: Web Redis CLI Terminal */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 overflow-hidden">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>Terminal Redis CLI Web</span>
            <span className="text-[10px] text-slate-500 font-mono">Comandos interativos diretos</span>
          </div>
          <button
            type="button"
            onClick={() => setCliHistory([])}
            className="text-[11px] text-slate-500 hover:text-slate-300 font-mono transition-colors"
          >
            Limpar Terminal
          </button>
        </div>

        {/* CLI History Output */}
        <div className="bg-slate-950 rounded-2xl border border-slate-850 p-4 h-44 overflow-y-auto font-mono text-xs space-y-2 mb-3">
          {cliHistory.map((item, idx) => (
            <div key={idx} className="space-y-0.5">
              <div className="text-emerald-400 flex items-center gap-2">
                <span>&gt; {item.cmd}</span>
              </div>
              <div className="text-slate-300 pl-4 whitespace-pre-wrap">
                {typeof item.res === 'object' ? JSON.stringify(item.res, null, 2) : String(item.res)}
              </div>
            </div>
          ))}
        </div>

        {/* CLI Prompt Form */}
        <form onSubmit={handleRunCli} className="flex items-center gap-2">
          <span className="font-mono text-emerald-400 text-sm font-bold pl-2">&gt;</span>
          <input
            type="text"
            value={cliCommand}
            onChange={(e) => setCliCommand(e.target.value)}
            placeholder="Digite um comando (ex: PING, INFO, GET chave, HGETALL chave, KEYS *)..."
            className="flex-1 px-3 py-2 text-xs bg-slate-950 text-slate-100 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
          />
          <button
            type="submit"
            disabled={isCliLoading || !cliCommand.trim()}
            className="px-4 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-xl transition-colors font-mono"
          >
            {isCliLoading ? 'Executando...' : 'Executar'}
          </button>
        </form>
      </div>

      {/* Modal Criar Nova Chave */}
      {isNewKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <form
            onSubmit={handleCreateKey}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl"
          >
            <h3 className="font-bold text-slate-100 text-sm mb-4">Adicionar Nova Chave ao Redis</h3>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Nome da Chave</label>
                <input
                  type="text"
                  required
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="ex: cache:usuario:10 ou bull:fila"
                  className="w-full px-3 py-2 text-xs bg-slate-950 text-slate-100 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Tipo da Chave</label>
                <select
                  value={newKeyType}
                  onChange={(e) => setNewKeyType(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 text-slate-100 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                >
                  <option value="string">STRING</option>
                  <option value="hash">HASH</option>
                </select>
              </div>

              {newKeyType === 'hash' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Campo do Hash (Field)</label>
                  <input
                    type="text"
                    value={newKeyHashField}
                    onChange={(e) => setNewKeyHashField(e.target.value)}
                    placeholder="ex: nome, email, id"
                    className="w-full px-3 py-2 text-xs bg-slate-950 text-slate-100 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Valor</label>
                <textarea
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  placeholder="Valor em texto ou JSON..."
                  className="w-full h-24 p-3 text-xs bg-slate-950 text-slate-100 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Tempo de Expiração TTL (Segundos, opcional)
                </label>
                <input
                  type="number"
                  value={newKeyTTL}
                  onChange={(e) => setNewKeyTTL(e.target.value)}
                  placeholder="ex: 3600 (1 hora)"
                  className="w-full px-3 py-2 text-xs bg-slate-950 text-slate-100 border border-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNewKeyModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!newKeyName.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-xl transition-colors"
              >
                Criar Chave
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
