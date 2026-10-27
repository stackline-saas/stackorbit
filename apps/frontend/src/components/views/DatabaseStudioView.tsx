import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Database,
  Table as TableIcon,
  Play,
  Key,
  Link as LinkIcon,
  Layers,
  Code,
  RefreshCw,
  ArrowLeft,
  Copy,
  Check,
  AlertCircle,
  FileText,
  Search,
  ExternalLink,
  ChevronRight,
  Terminal,
} from 'lucide-react';
import type {
  DatabaseCatalog,
  DatabaseTable,
  DatabaseColumn,
  DatabaseForeignKey,
  Service,
} from '../../types/index.ts';
import { DatabaseDiagramMER } from '../DatabaseDiagramMER.tsx';
import { RedisStudioView } from '../RedisStudioView.tsx';

export const DatabaseStudioView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [service, setService] = useState<Service | null>(null);
  const [catalog, setCatalog] = useState<DatabaseCatalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab ativa: 'columns' | 'data' | 'diagram' | 'sql' | 'connection'
  const [activeTab, setActiveTab] = useState<'columns' | 'data' | 'diagram' | 'sql' | 'connection'>('columns');
  const [selectedTable, setSelectedTable] = useState<DatabaseTable | null>(null);

  // Dados da tabela (Data Grid)
  const [tableData, setTableData] = useState<{ rows: any[]; totalCount: number; page: number; limit: number } | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Console SQL
  const [sqlQuery, setSqlQuery] = useState('SELECT 1 as teste, now() as horario;');
  const [sqlResult, setSqlResult] = useState<{ rows: any[]; rowCount: number; durationMs: number } | null>(null);
  const [isExecutingSql, setIsExecutingSql] = useState(false);
  const [sqlError, setSqlError] = useState<string | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Carrega serviço e schema
  const loadDatabase = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Carrega dados do serviço
      const srvRes = await fetch(`/api/services/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });
      if (!srvRes.ok) throw new Error('Serviço de banco de dados não encontrado.');
      const srvData = await srvRes.json();
      setService(srvData);

      const img = (srvData.image || '').toLowerCase();
      // Se for Redis, delega para o RedisStudioView
      if (img.includes('redis')) {
        setIsLoading(false);
        return;
      }

      // 2. Carrega catálogo do banco relacional
      const catRes = await fetch(`/api/databases/${id}/schema`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });
      if (!catRes.ok) {
        const errJson = await catRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Erro ao inspecionar catálogo do banco.');
      }

      const catData: DatabaseCatalog = await catRes.json();
      setCatalog(catData);
      if (catData.tables.length > 0) {
        setSelectedTable(catData.tables[0]);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDatabase();
  }, [id]);

  // Carrega dados da tabela selecionada quando muda tabela ou página
  const loadTableData = async (tableName: string, page: number = 1) => {
    if (!id || !tableName) return;
    setIsLoadingData(true);
    try {
      const res = await fetch(`/api/databases/${id}/table-data?table=${encodeURIComponent(tableName)}&page=${page}&limit=50`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTableData(data);
        setCurrentPage(page);
      }
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'data' && selectedTable) {
      loadTableData(selectedTable.name, 1);
    }
  }, [activeTab, selectedTable]);

  // Executa query no console SQL
  const handleExecuteSql = async () => {
    if (!id || !sqlQuery.trim()) return;
    setIsExecutingSql(true);
    setSqlError(null);

    try {
      const res = await fetch(`/api/databases/${id}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
        },
        body: JSON.stringify({ query: sqlQuery }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro na execução da consulta SQL.');
      }
      setSqlResult(data);
    } catch (err: any) {
      setSqlError(err.message);
    } finally {
      setIsExecutingSql(false);
    }
  };

  const copyToClipboard = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="py-24 text-center bg-white rounded-3xl border border-slate-200">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
        <p className="font-semibold text-slate-700 text-sm">Carregando Database Studio...</p>
      </div>
    );
  }

  // Se o serviço for Redis, exibe o Redis Studio
  if (service && (service.image || '').toLowerCase().includes('redis')) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/databases')}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-red-500" />
              <span>Redis Studio: {service.name}</span>
            </h1>
            <p className="text-xs text-slate-500 font-mono">{service.containerName}</p>
          </div>
        </div>

        <RedisStudioView serviceId={service.id} serviceName={service.name} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => navigate('/databases')}
            className="p-2 hover:bg-slate-100 rounded-2xl text-slate-500 hover:text-slate-900 transition-colors"
            title="Voltar para Bancos de Dados"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="p-3 bg-blue-50 border border-blue-200/60 rounded-2xl text-blue-600">
            <Database className="w-6 h-6" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">{service?.name}</h1>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 rounded-full uppercase">
                {catalog?.databaseType || 'SQL'}
              </span>
              <span className="text-xs text-slate-400 font-mono hidden md:inline">
                {catalog?.version?.split(',')[0]}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Banco: <strong className="text-slate-700">{catalog?.databaseName}</strong> • {catalog?.tables.length || 0} tabelas • Porta :{service?.internalPort || 5432}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadDatabase}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition-all"
            title="Recarregar catálogo"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sql')}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            <Code className="w-4 h-4" />
            <span>Console SQL</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-xs text-red-600">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Studio Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Sidebar: Catalog Tree (3 cols) */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs flex flex-col max-h-[750px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Catálogo do Banco</span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-bold">
              {catalog?.tables.length || 0}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Tabelas */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Tabelas ({catalog?.tables.length || 0})
              </span>
              <div className="space-y-1">
                {catalog?.tables.map((tbl: DatabaseTable) => (
                  <button
                    key={tbl.name}
                    type="button"
                    onClick={() => {
                      setSelectedTable(tbl);
                      if (activeTab === 'sql') setActiveTab('columns');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-mono transition-colors text-left ${
                      selectedTable?.name === tbl.name
                        ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200/60 shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <TableIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="truncate">{tbl.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-sans shrink-0">
                      {tbl.columns.length} col
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Views */}
            {catalog && catalog.views.length > 0 && (
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Views ({catalog.views.length})
                </span>
                <div className="space-y-1">
                  {catalog.views.map((vw: string) => (
                    <div key={vw} className="px-3 py-1.5 text-xs text-slate-500 font-mono truncate">
                      👁️ {vw}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Main Area (9 cols) */}
        <div className="lg:col-span-9 bg-white border border-slate-200 rounded-3xl shadow-2xs overflow-hidden flex flex-col">
          {/* Top Tabs */}
          <div className="flex items-center gap-1 p-3 border-b border-slate-100 bg-slate-50/50 overflow-x-auto">
            {[
              { id: 'columns', label: 'Estrutura & Colunas', icon: TableIcon },
              { id: 'data', label: 'Dados da Tabela (Grid)', icon: FileText },
              { id: 'diagram', label: 'Diagrama MER Interativo', icon: Layers },
              { id: 'sql', label: 'Console SQL', icon: Terminal },
              { id: 'connection', label: 'String de Conexão', icon: LinkIcon },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab 1: Estrutura & Colunas */}
          {activeTab === 'columns' && selectedTable && (
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm font-mono flex items-center gap-2">
                    <TableIcon className="w-4 h-4 text-blue-600" />
                    <span>Tabela: {selectedTable.name}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedTable.columns.length} colunas configuradas • Schema: {selectedTable.schema}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('data')}
                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-colors"
                >
                  Ver Registros da Tabela
                </button>
              </div>

              {/* Columns Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-4">Coluna</th>
                      <th className="py-2.5 px-4">Tipo de Dado</th>
                      <th className="py-2.5 px-4">Permite Nulo?</th>
                      <th className="py-2.5 px-4">Chave</th>
                      <th className="py-2.5 px-4">Valor Padrão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedTable.columns.map((col: DatabaseColumn) => (
                      <tr key={col.name} className="hover:bg-slate-50/60 font-mono text-[11px]">
                        <td className="py-2.5 px-4 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            {col.isPrimaryKey && <Key className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                            {col.isForeignKey && <LinkIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                            <span>{col.name}</span>
                          </div>
                        </td>

                        <td className="py-2.5 px-4 text-purple-700 uppercase font-semibold">
                          {col.type}
                        </td>

                        <td className="py-2.5 px-4">
                          {col.nullable ? (
                            <span className="text-slate-400">SIM</span>
                          ) : (
                            <span className="text-rose-600 font-bold">NÃO (NOT NULL)</span>
                          )}
                        </td>

                        <td className="py-2.5 px-4">
                          {col.isPrimaryKey ? (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md font-bold text-[10px]">
                              PRIMARY KEY
                            </span>
                          ) : col.isForeignKey ? (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md font-bold text-[10px]">
                              FOREIGN KEY
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        <td className="py-2.5 px-4 text-slate-500 truncate max-w-xs">
                          {col.defaultValue || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Foreign Keys Details */}
              {selectedTable.foreignKeys.length > 0 && (
                <div className="p-4 bg-blue-50/50 border border-blue-200/60 rounded-2xl space-y-2">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <LinkIcon className="w-3.5 h-3.5" /> Chaves Estrangeiras (Relacionamentos)
                  </span>
                  <div className="space-y-1">
                    {selectedTable.foreignKeys.map((fk: DatabaseForeignKey) => (
                      <div key={fk.column} className="text-xs text-blue-700 font-mono">
                        • <strong>{fk.column}</strong> aponta para{' '}
                        <strong className="underline cursor-pointer" onClick={() => {
                          const target = catalog?.tables.find((t: DatabaseTable) => t.name === fk.referencedTable);
                          if (target) setSelectedTable(target);
                        }}>
                          {fk.referencedTable}({fk.referencedColumn})
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Dados da Tabela (Grid) */}
          {activeTab === 'data' && selectedTable && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700 font-mono">
                  Registros: {selectedTable.name} (Total: {tableData?.totalCount || 0})
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadTableData(selectedTable.name, currentPage)}
                    className="p-1.5 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors"
                    title="Recarregar dados"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin text-blue-600' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Data Grid Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl max-h-[500px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0">
                      {selectedTable.columns.map((col: DatabaseColumn) => (
                        <th key={col.name} className="py-2.5 px-4 font-mono">
                          {col.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {isLoadingData ? (
                      <tr>
                        <td colSpan={selectedTable.columns.length} className="py-12 text-center text-slate-400">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                          <span>Carregando registros...</span>
                        </td>
                      </tr>
                    ) : !tableData || tableData.rows.length === 0 ? (
                      <tr>
                        <td colSpan={selectedTable.columns.length} className="py-12 text-center text-slate-400">
                          Esta tabela não possui nenhum registro ainda.
                        </td>
                      </tr>
                    ) : (
                      tableData.rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80">
                          {selectedTable.columns.map((col: DatabaseColumn) => (
                            <td key={col.name} className="py-2.5 px-4 text-slate-800 truncate max-w-xs">
                              {row[col.name] !== null && row[col.name] !== undefined
                                ? typeof row[col.name] === 'object'
                                  ? JSON.stringify(row[col.name])
                                  : String(row[col.name])
                                : <span className="text-slate-300 italic">null</span>}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 3: Diagrama MER Interativo */}
          {activeTab === 'diagram' && catalog && (
            <div className="p-4">
              <DatabaseDiagramMER tables={catalog.tables} databaseName={catalog.databaseName} />
            </div>
          )}

          {/* Tab 4: Console SQL */}
          {activeTab === 'sql' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-blue-600" />
                  <span>Editor de Consultas SQL</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  Atalho: <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono">Ctrl+Enter</kbd>
                </span>
              </div>

              {/* SQL Textarea */}
              <div className="relative">
                <textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleExecuteSql();
                    }
                  }}
                  spellCheck={false}
                  rows={6}
                  className="w-full p-4 bg-slate-950 text-emerald-400 font-mono text-xs rounded-2xl border border-slate-800 outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed resize-y"
                  placeholder="Digite sua query SQL (ex: SELECT * FROM users LIMIT 10;)"
                />

                <div className="absolute right-3 bottom-4">
                  <button
                    type="button"
                    onClick={handleExecuteSql}
                    disabled={isExecutingSql || !sqlQuery.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md transition-colors"
                  >
                    {isExecutingSql ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    <span>Executar Query</span>
                  </button>
                </div>
              </div>

              {/* SQL Error */}
              {sqlError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-mono">
                  {sqlError}
                </div>
              )}

              {/* SQL Results Grid */}
              {sqlResult && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                    <span>Linhas retornadas: {sqlResult.rowCount}</span>
                    <span>Tempo de execução: {sqlResult.durationMs}ms</span>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-2xl max-h-96">
                    {sqlResult.rows.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-xs">
                        Consulta executada com sucesso. Nenhuma linha retornada.
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                            {Object.keys(sqlResult.rows[0] || {}).map((colName) => (
                              <th key={colName} className="py-2.5 px-4 font-mono">{colName}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                          {sqlResult.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50/60">
                              {Object.values(row).map((val: any, cIdx) => (
                                <td key={cIdx} className="py-2 px-4 text-slate-800 truncate max-w-xs">
                                  {val !== null && val !== undefined ? String(val) : <span className="text-slate-300 italic">null</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 5: String de Conexão */}
          {activeTab === 'connection' && (
            <div className="p-6 space-y-4">
              <h3 className="font-bold text-slate-900 text-sm">Strings de Conexão do Banco</h3>
              <p className="text-xs text-slate-500">
                Utilize estas URLs para conectar via Prisma, TypeORM, DBeaver, TablePlus ou diretamente pelo seu backend.
              </p>

              {/* Connection Strings Box */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                    Rede Interna Docker (Entre Containers na rede proxy-net)
                  </label>
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800">
                    <span className="truncate pr-2">
                      {catalog?.databaseType === 'postgres'
                        ? `postgresql://postgres:senha@${service?.containerName}:${service?.internalPort || 5432}/${catalog.databaseName}`
                        : `mysql://root:senha@${service?.containerName}:${service?.internalPort || 3306}/${catalog?.databaseName}`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          catalog?.databaseType === 'postgres'
                            ? `postgresql://postgres:senha@${service?.containerName}:${service?.internalPort || 5432}/${catalog.databaseName}`
                            : `mysql://root:senha@${service?.containerName}:${service?.internalPort || 3306}/${catalog?.databaseName}`,
                          'internal'
                        )
                      }
                      className="p-1 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                    >
                      {copiedKey === 'internal' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
