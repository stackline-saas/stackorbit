import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
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
  Plus,
  X,
  Download,
  Filter,
  Columns,
  Sparkles,
  ChevronLeft,
  FileCode,
  HelpCircle,
  CheckCircle2,
  RotateCcw,
  Save,
  Zap,
  GitCommit,
  ShieldCheck,
  Table2,
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
import { DatabaseTreeSidebar } from '../DatabaseTreeSidebar.tsx';

interface StudioTab {
  id: string;
  type: 'table' | 'sql';
  title: string;
  tableName?: string;
  activeSubTab?: 'data' | 'structure' | 'mer' | 'ddl';
  // SQL Query properties
  query?: string;
  result?: { rows: any[]; rowCount: number; durationMs: number } | null;
  error?: string | null;
  isExecuting?: boolean;
}

export const DatabaseStudioView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [service, setService] = useState<Service | null>(null);
  const [catalog, setCatalog] = useState<DatabaseCatalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Workspace Multi-Tabs (estilo DBeaver / DataGrip)
  const [tabs, setTabs] = useState<StudioTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Estado de dados para cada tabela aberta: { [tableName]: { rows, totalCount, page, limit, isLoading, filter } }
  const [tableDataCache, setTableDataCache] = useState<
    Record<
      string,
      {
        rows: any[];
        totalCount: number;
        page: number;
        limit: number;
        isLoading: boolean;
        error?: string | null;
      }
    >
  >({});

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const token = localStorage.getItem('dm_auth_token') || '';

  // ==========================================
  // ESTADO DE EDIÇÃO DE DADOS TABULARES E TRANSAÇÕES
  // ==========================================
  const [commitMode, setCommitMode] = useState<'auto' | 'transaction'>('transaction');
  const [editingCell, setEditingCell] = useState<{
    tableName: string;
    rowPkString: string;
    colName: string;
    value: string;
  } | null>(null);
  // pendingEdits: { [tableName]: { [rowPkString]: { primaryKey, changes, originalRow } } }
  const [pendingEdits, setPendingEdits] = useState<
    Record<
      string,
      Record<
        string,
        {
          primaryKey: Record<string, any>;
          changes: Record<string, any>;
          originalRow: any;
        }
      >
    >
  >({});
  const [isSavingEdits, setIsSavingEdits] = useState(false);
  const [editFeedback, setEditFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sub-abas internas de Estrutura & Colunas
  const [structureSection, setStructureSection] = useState<'columns' | 'fks' | 'dependencies' | 'indexes'>('columns');

  // Carrega catálogo e dados do serviço
  const loadDatabase = useCallback(
    async (targetDb?: string) => {
      if (!id) return;
      setIsLoading(true);
      setError(null);

      try {
        // 1. Serviço
        const srvRes = await fetch(`/api/services/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!srvRes.ok) throw new Error('Serviço de banco de dados não localizado.');
        const srvData = await srvRes.json();
        setService(srvData);

        const img = (srvData.image || '').toLowerCase();
        if (img.includes('redis')) {
          setIsLoading(false);
          return;
        }

        // 2. Catálogo Relacional
        const dbQuery = targetDb ? `?db=${encodeURIComponent(targetDb)}` : '';
        const catRes = await fetch(`/api/databases/${id}/schema${dbQuery}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!catRes.ok) {
          const errJson = await catRes.json().catch(() => ({}));
          throw new Error(errJson.error || 'Erro ao carregar catálogo do banco.');
        }

        const catData: DatabaseCatalog = await catRes.json();
        setCatalog(catData);

        // Se nenhuma aba estiver aberta e tiver tabelas, abre a primeira tabela por padrão
        if (catData.tables.length > 0) {
          setTabs((prev) => {
            if (prev.length > 0) return prev;
            const firstTable = catData.tables[0];
            const initialTab: StudioTab = {
              id: `table-${firstTable.name}`,
              type: 'table',
              title: firstTable.name,
              tableName: firstTable.name,
              activeSubTab: 'data',
            };
            setActiveTabId(initialTab.id);
            return [initialTab];
          });
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [id, token]
  );

  useEffect(() => {
    loadDatabase();
  }, [loadDatabase]);

  // Carrega dados paginados de uma tabela específica
  const loadTableData = useCallback(
    async (tableName: string, page: number = 1, limit: number = 50) => {
      if (!id) return;

      setTableDataCache((prev) => ({
        ...prev,
        [tableName]: {
          ...(prev[tableName] || { rows: [], totalCount: 0, page: 1, limit: 50 }),
          isLoading: true,
          error: null,
        },
      }));

      try {
        const dbQuery = catalog?.databaseName ? `&db=${encodeURIComponent(catalog.databaseName)}` : '';
        const res = await fetch(
          `/api/databases/${id}/table-data?table=${encodeURIComponent(tableName)}&page=${page}&limit=${limit}${dbQuery}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Erro ao obter dados da tabela.');
        }

        const data = await res.json();
        setTableDataCache((prev) => ({
          ...prev,
          [tableName]: {
            rows: data.rows || [],
            totalCount: data.totalCount || 0,
            page: data.page || page,
            limit: data.limit || limit,
            isLoading: false,
            error: null,
          },
        }));
      } catch (err: any) {
        setTableDataCache((prev) => ({
          ...prev,
          [tableName]: {
            ...(prev[tableName] || { rows: [], totalCount: 0, page: 1, limit: 50 }),
            isLoading: false,
            error: err.message,
          },
        }));
      }
    },
    [id, catalog?.databaseName, token]
  );

  // ==========================================
  // HELPERS DE EDIÇÃO INLINE E TRANSAÇÕES
  // ==========================================
  const getRowPkObject = (table: DatabaseTable, row: any): Record<string, any> => {
    const pks = table.primaryKeys && table.primaryKeys.length > 0 ? table.primaryKeys : ['id'];
    const res: Record<string, any> = {};
    for (const pk of pks) {
      if (row[pk] !== undefined) {
        res[pk] = row[pk];
      }
    }
    if (Object.keys(res).length === 0 && table.columns.length > 0) {
      const firstCol = table.columns[0].name;
      res[firstCol] = row[firstCol];
    }
    return res;
  };

  const getRowPkString = (table: DatabaseTable, row: any): string => {
    const obj = getRowPkObject(table, row);
    return Object.entries(obj)
      .map(([k, v]) => `${k}:${v}`)
      .join('|');
  };

  // Salvar uma célula (ao teclar Enter ou sair do foco)
  const saveCellEdit = async (
    table: DatabaseTable,
    row: any,
    colName: string,
    newValueStr: string
  ) => {
    setEditingCell(null);
    const originalVal = row[colName];
    const originalStr =
      originalVal === null || originalVal === undefined
        ? ''
        : typeof originalVal === 'object'
        ? JSON.stringify(originalVal)
        : String(originalVal);

    if (newValueStr === originalStr) return;

    const colDef = table.columns.find((c) => c.name === colName);
    let parsedVal: any = newValueStr;
    const colType = (colDef?.type || '').toLowerCase();

    if (newValueStr === '' && colDef?.nullable) {
      parsedVal = null;
    } else if (
      colType.includes('int') ||
      colType.includes('numeric') ||
      colType.includes('decimal') ||
      colType.includes('float')
    ) {
      if (newValueStr !== '' && !isNaN(Number(newValueStr))) {
        parsedVal = Number(newValueStr);
      }
    } else if (colType.includes('bool')) {
      parsedVal = newValueStr.toLowerCase() === 'true';
    }

    const pkObj = getRowPkObject(table, row);
    const pkStr = getRowPkString(table, row);
    const tableName = table.name;

    if (commitMode === 'auto') {
      // Auto-commit: salva imediatamente na base
      setIsSavingEdits(true);
      setEditFeedback(null);
      try {
        const res = await fetch(`/api/databases/${id}/table-data/update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            table: tableName,
            db: catalog?.databaseName,
            mode: 'auto',
            updates: [{ primaryKey: pkObj, changes: { [colName]: parsedVal } }],
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Erro ao aplicar alteração.');
        }

        // Atualiza localmente no cache da tabela
        setTableDataCache((prev) => {
          const cur = prev[tableName];
          if (!cur) return prev;
          const updatedRows = cur.rows.map((r) => {
            if (getRowPkString(table, r) === pkStr) {
              return { ...r, [colName]: parsedVal };
            }
            return r;
          });
          return { ...prev, [tableName]: { ...cur, rows: updatedRows } };
        });

        setEditFeedback({ type: 'success', message: 'Célula atualizada no banco (Auto-commit)!' });
        setTimeout(() => setEditFeedback(null), 2500);
      } catch (err: any) {
        setEditFeedback({ type: 'error', message: err.message });
      } finally {
        setIsSavingEdits(false);
      }
    } else {
      // Modo Transação (Manual): acumula pendências
      setPendingEdits((prev) => {
        const tableEdits = prev[tableName] || {};
        const existingRowEdit = tableEdits[pkStr] || {
          primaryKey: pkObj,
          changes: {},
          originalRow: row,
        };

        return {
          ...prev,
          [tableName]: {
            ...tableEdits,
            [pkStr]: {
              ...existingRowEdit,
              changes: {
                ...existingRowEdit.changes,
                [colName]: parsedVal,
              },
            },
          },
        };
      });
      setEditFeedback({
        type: 'success',
        message: 'Linha marcada como modificada. Clique em "Commit" para salvar ou "Rollback" para cancelar.',
      });
      setTimeout(() => setEditFeedback(null), 4000);
    }
  };

  // Commit da transação (todas as linhas alteradas da tabela)
  const commitTransaction = async (table: DatabaseTable) => {
    const tableName = table.name;
    const tableEdits = pendingEdits[tableName];
    if (!tableEdits || Object.keys(tableEdits).length === 0) return;

    const updates = Object.values(tableEdits).map((edit) => ({
      primaryKey: edit.primaryKey,
      changes: edit.changes,
    }));

    setIsSavingEdits(true);
    setEditFeedback(null);
    try {
      const res = await fetch(`/api/databases/${id}/table-data/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          table: tableName,
          db: catalog?.databaseName,
          mode: 'commit',
          updates,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao efetivar transação (Rollback automático).');
      }

      // Aplica as alterações no cache local
      setTableDataCache((prev) => {
        const cur = prev[tableName];
        if (!cur) return prev;
        const updatedRows = cur.rows.map((r) => {
          const pkStr = getRowPkString(table, r);
          if (tableEdits[pkStr]) {
            return { ...r, ...tableEdits[pkStr].changes };
          }
          return r;
        });
        return { ...prev, [tableName]: { ...cur, rows: updatedRows } };
      });

      // Limpa alterações pendentes desta tabela
      setPendingEdits((prev) => {
        const copy = { ...prev };
        delete copy[tableName];
        return copy;
      });

      setEditFeedback({
        type: 'success',
        message: `Transação comitada com sucesso! (${updates.length} linha(s) salvas no banco)`,
      });
      setTimeout(() => setEditFeedback(null), 3000);
    } catch (err: any) {
      setEditFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSavingEdits(false);
    }
  };

  // Rollback da transação (descarta alterações locais)
  const rollbackTransaction = (tableName: string) => {
    setPendingEdits((prev) => {
      const copy = { ...prev };
      delete copy[tableName];
      return copy;
    });
    setEditingCell(null);
    setEditFeedback({ type: 'success', message: 'Alterações descartadas com sucesso (Rollback).' });
    setTimeout(() => setEditFeedback(null), 2500);
  };

  // Abrir ou focar na aba de uma tabela
  const openTableTab = (tableName: string, initialSubTab: 'data' | 'structure' | 'mer' | 'ddl' = 'data') => {
    const tabId = `table-${tableName}`;
    const existing = tabs.find((t) => t.id === tabId);

    if (existing) {
      if (initialSubTab) {
        setTabs((prev) =>
          prev.map((t) => (t.id === tabId ? { ...t, activeSubTab: initialSubTab } : t))
        );
      }
      setActiveTabId(tabId);
    } else {
      const newTab: StudioTab = {
        id: tabId,
        type: 'table',
        title: tableName,
        tableName,
        activeSubTab: initialSubTab,
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(tabId);
    }

    // Carrega dados da tabela se ainda não estiver em cache
    if (!tableDataCache[tableName]) {
      loadTableData(tableName, 1);
    }
  };

  // Abrir uma nova aba de Consulta SQL
  const openNewSqlTab = (initialQuery?: string, tabTitle?: string) => {
    const count = tabs.filter((t) => t.type === 'sql').length + 1;
    const tabId = `sql-${Date.now()}`;
    const defaultSql =
      initialQuery ||
      (catalog?.tables[0]
        ? `SELECT * FROM "${catalog.tables[0].name}" LIMIT 50;`
        : 'SELECT 1 as teste, now() as data_hora;');

    const newTab: StudioTab = {
      id: tabId,
      type: 'sql',
      title: tabTitle ? `SQL: ${tabTitle}` : `Consulta ${count}`,
      query: defaultSql,
      result: null,
      error: null,
      isExecuting: false,
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(tabId);
  };

  // Fechar aba
  const closeTab = (tabId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const remaining = tabs.filter((t) => t.id !== tabId);
    setTabs(remaining);

    if (activeTabId === tabId) {
      if (remaining.length > 0) {
        setActiveTabId(remaining[remaining.length - 1].id);
      } else {
        setActiveTabId(null);
      }
    }
  };

  // Alterar subtab da tabela ativa
  const setTableSubTab = (tabId: string, subTab: 'data' | 'structure' | 'mer' | 'ddl') => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, activeSubTab: subTab } : t))
    );
  };

  // Executar query SQL na aba SQL ativa
  const executeActiveSqlQuery = async () => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab || activeTab.type !== 'sql' || !activeTab.query?.trim() || !id) return;

    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId ? { ...t, isExecuting: true, error: null } : t
      )
    );

    try {
      const res = await fetch(`/api/databases/${id}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: activeTab.query,
          db: catalog?.databaseName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro na execução da consulta SQL.');
      }

      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId
            ? { ...t, isExecuting: false, result: data, error: null }
            : t
        )
      );
    } catch (err: any) {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId
            ? { ...t, isExecuting: false, error: err.message, result: null }
            : t
        )
      );
    }
  };

  // Gerar DDL CREATE TABLE para visualização
  const generateDDL = (table: DatabaseTable): string => {
    const cols = table.columns.map((c) => {
      let def = `  "${c.name}" ${c.type}`;
      if (!c.nullable) def += ' NOT NULL';
      if (c.defaultValue) def += ` DEFAULT ${c.defaultValue}`;
      return def;
    });

    if (table.primaryKeys.length > 0) {
      cols.push(`  PRIMARY KEY (${table.primaryKeys.map((k) => `"${k}"`).join(', ')})`);
    }

    table.foreignKeys.forEach((fk) => {
      cols.push(
        `  CONSTRAINT "${fk.constraintName || `fk_${table.name}_${fk.column}`}" FOREIGN KEY ("${fk.column}") REFERENCES "${fk.referencedTable}" ("${fk.referencedColumn}")`
      );
    });

    return `CREATE TABLE "${table.name}" (\n${cols.join(',\n')}\n);`;
  };

  // Exportar dados para CSV
  const exportToCSV = (tableName: string, rows: any[]) => {
    if (!rows || rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csvLines = [headers.join(',')];

    rows.forEach((row) => {
      const values = headers.map((header) => {
        const val = row[header];
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      csvLines.push(values.join(','));
    });

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tableName}_export.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Copiar para clipboard com feedback
  const copyToClipboard = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeTable = activeTab?.tableName
    ? catalog?.tables.find((t) => t.name === activeTab.tableName)
    : null;
  const activeTableData = activeTab?.tableName ? tableDataCache[activeTab.tableName] : null;

  // Se o serviço for Redis, renderiza o RedisStudioView
  if (service && (service.image || '').toLowerCase().includes('redis')) {
    return (
      <div className="space-y-4">
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

  if (isLoading && !catalog) {
    return (
      <div className="py-24 text-center bg-white rounded-3xl border border-slate-200">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
        <p className="font-semibold text-slate-700 text-sm">Conectando ao Database Studio...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] w-full bg-slate-50 text-slate-800 font-sans rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
      {/* 1. TOP HEADER (STATUS, BANCO ATIVO, CONEXÃO) */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between gap-4 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/databases')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-bold border border-slate-200 transition-colors"
            title="Voltar para a lista de Bancos"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Bancos</span>
          </button>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 truncate">{service?.name}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold uppercase">
                  {catalog?.databaseType || 'SQL'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                <span>Banco:</span>
                {catalog?.availableDatabases && catalog.availableDatabases.length > 1 ? (
                  <select
                    value={catalog.databaseName}
                    onChange={(e) => loadDatabase(e.target.value)}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-blue-700 border border-slate-300 rounded font-mono font-bold cursor-pointer text-xs"
                  >
                    {catalog.availableDatabases.map((dbName) => (
                      <option key={dbName} value={dbName}>
                        {dbName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <strong className="text-slate-700">{catalog?.databaseName}</strong>
                )}
                <span>•</span>
                <span>{catalog?.tables.length || 0} tabelas</span>
              </div>
            </div>
          </div>
        </div>

        {/* Direita: Nova Consulta SQL + Recarregar */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openNewSqlTab()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Consulta SQL</span>
          </button>

          <button
            type="button"
            onClick={() => loadDatabase(catalog?.databaseName)}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl border border-slate-200 transition-colors shadow-2xs"
            title="Recarregar catálogo"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. ÁREA DE TRABALHO: BARRA LATERAL (TABELAS) + WORKSPACE DE ABAS (ESTILO DBEAVER) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ========================================================
            BARRA LATERAL ESQUERDA: NAVEGADOR DE OBJETOS HIERÁRQUICO (ESTILO DBEAVER / DATAGRIP)
           ======================================================== */}
        <DatabaseTreeSidebar
          catalog={catalog}
          activeTableName={activeTab?.tableName}
          openTableNames={tabs.filter((t) => t.tableName).map((t) => t.tableName as string)}
          onOpenTable={openTableTab}
          onOpenSql={(query, title) => openNewSqlTab(query, title)}
          onRefresh={() => loadDatabase(catalog?.databaseName)}
          serviceName={service?.name}
          servicePort={service?.internalPort}
          copiedKey={copiedKey}
          onCopy={copyToClipboard}
        />

        {/* ========================================================
            PAINEL PRINCIPAL: SISTEMA DE ABAS (ESTILO DBEAVER)
           ======================================================== */}
        <main className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
          {/* BARRA DE ABAS DBEAVER (FLAT, SEM ROUNDED) */}
          <div className="h-9 bg-slate-100 border-b border-slate-200 flex items-stretch px-0 overflow-x-auto no-scrollbar shrink-0">
            {tabs.length === 0 ? (
              <span className="text-xs text-slate-400 px-3 py-2 font-mono flex items-center">Nenhuma aba aberta</span>
            ) : (
              tabs.map((tab) => {
                const isActive = activeTabId === tab.id;
                return (
                  <div
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    className={`group flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold transition-all border-r border-slate-200 border-t-2 shrink-0 cursor-pointer max-w-[220px] select-none ${
                      isActive
                        ? 'bg-white text-slate-900 border-t-blue-600 font-bold border-b border-b-white -mb-px'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 border-t-transparent'
                    }`}
                  >
                    {tab.type === 'table' ? (
                      <TableIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    ) : (
                      <Terminal className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    )}
                    <span className="truncate font-mono">{tab.title}</span>
                    <button
                      type="button"
                      onClick={(e) => closeTab(tab.id, e)}
                      className="p-0.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}

            <button
              type="button"
              onClick={() => openNewSqlTab()}
              className="flex items-center px-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors border-r border-slate-200"
              title="Nova Consulta SQL"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* ========================================================
              CONTEÚDO DA ABA ATIVA
             ======================================================== */}
          {activeTab ? (
            activeTab.type === 'table' && activeTable ? (
              /* MODO ABA DE TABELA */
              <div className="flex-1 flex flex-col min-h-0 bg-white">
                {/* SUB-TABS DA TABELA: DADOS | ESTRUTURA | MER | DDL */}
                <div className="h-10 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setTableSubTab(activeTab.id, 'data')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeTab.activeSubTab === 'data'
                          ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200/80 shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Columns className="w-3.5 h-3.5" />
                      <span>Dados (Grid)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTableSubTab(activeTab.id, 'structure')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeTab.activeSubTab === 'structure'
                          ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200/80 shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Estrutura & Colunas</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTableSubTab(activeTab.id, 'mer')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeTab.activeSubTab === 'mer'
                          ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200/80 shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
                      <span>Diagrama MER (Relações)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTableSubTab(activeTab.id, 'ddl')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeTab.activeSubTab === 'ddl'
                          ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200/80 shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <FileCode className="w-3.5 h-3.5 text-emerald-600" />
                      <span>DDL (SQL)</span>
                    </button>
                  </div>

                  {/* Ações da Tabela */}
                  <div className="flex items-center gap-2">
                    {activeTab.activeSubTab === 'data' && (
                      <>
                        <button
                          type="button"
                          onClick={() => exportToCSV(activeTable.name, activeTableData?.rows || [])}
                          disabled={!activeTableData || activeTableData.rows.length === 0}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
                          title="Exportar dados para CSV"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>CSV</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            loadTableData(activeTable.name, activeTableData?.page || 1, activeTableData?.limit || 50)
                          }
                          className="p-1.5 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors"
                          title="Recarregar dados da tabela"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${activeTableData?.isLoading ? 'animate-spin text-blue-600' : ''}`}
                          />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* CONTEÚDO DA SUB-TAB */}
                <div className="flex-1 overflow-auto p-4">
                  {/* SUB-TAB 1: DADOS (GRID EDITÁVEL COM TRANSAÇÕES) */}
                  {activeTab.activeSubTab === 'data' && (() => {
                    const currentTableEdits = pendingEdits[activeTable.name] || {};
                    const pendingRowCount = Object.keys(currentTableEdits).length;

                    return (
                      <div className="space-y-3 h-full flex flex-col">
                        {/* BARRA DE FERRAMENTAS DO GRID */}
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs">
                          {/* Lado Esquerdo: Métricas e Indicador de Modificação */}
                          <div className="flex items-center gap-3">
                            <span className="text-slate-600 font-mono">
                              Total: <strong>{activeTableData?.totalCount ?? '...'}</strong> registros
                            </span>
                            <span className="text-slate-300">|</span>
                            <span className="text-slate-500 font-mono">
                              Página {activeTableData?.page || 1} de{' '}
                              {Math.max(1, Math.ceil((activeTableData?.totalCount || 0) / (activeTableData?.limit || 50)))}
                            </span>
                            {pendingRowCount > 0 && (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-full font-bold text-[11px] flex items-center gap-1.5 shadow-2xs animate-pulse">
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                <span>{pendingRowCount} linha(s) modificada(s)</span>
                              </span>
                            )}
                          </div>

                          {/* Lado Direito: Seletor de Modo e Ações de Transação */}
                          <div className="flex items-center gap-2">
                            {/* Seletor de Modo de Gravação */}
                            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                              <button
                                type="button"
                                onClick={() => setCommitMode('auto')}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                                  commitMode === 'auto'
                                    ? 'bg-blue-600 text-white shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                                title="Gravação instantânea ao alterar e sair de cada célula"
                              >
                                <Zap className="w-3 h-3" />
                                <span>Auto-commit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setCommitMode('transaction')}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                                  commitMode === 'transaction'
                                    ? 'bg-amber-600 text-white shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                                title="Acumula alterações para salvar em transação manual com Commit ou Rollback"
                              >
                                <GitCommit className="w-3 h-3" />
                                <span>Por Transação</span>
                              </button>
                            </div>

                            {/* Botões de Transação quando em Modo Manual */}
                            {commitMode === 'transaction' && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => commitTransaction(activeTable)}
                                  disabled={pendingRowCount === 0 || isSavingEdits}
                                  className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-all shadow-2xs"
                                  title="Efetivar alterações no banco de dados (COMMIT)"
                                >
                                  {isSavingEdits ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                  <span>Salvar (Commit)</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rollbackTransaction(activeTable.name)}
                                  disabled={pendingRowCount === 0 || isSavingEdits}
                                  className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-600 disabled:opacity-40 border border-slate-200 hover:border-rose-200 rounded-lg text-xs font-semibold transition-all"
                                  title="Descartar todas as alterações pendentes (ROLLBACK)"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Cancelar (Rollback)</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* MENSAGEM DE FEEDBACK */}
                        {editFeedback && (
                          <div
                            className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between animate-in fade-in ${
                              editFeedback.type === 'success'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-50 text-rose-800 border border-rose-200'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {editFeedback.type === 'success' ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              ) : (
                                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                              )}
                              <span>{editFeedback.message}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditFeedback(null)}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Tabela Data Grid */}
                        <div className="flex-1 overflow-auto border border-slate-200 rounded-xl shadow-2xs bg-white">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0 shadow-2xs z-10">
                                <th className="py-2.5 px-3 w-14 text-slate-400 font-mono text-center">#</th>
                                {activeTable.columns.map((col) => (
                                  <th key={col.name} className="py-2.5 px-3 font-mono">
                                    <div className="flex items-center gap-1.5">
                                      {col.isPrimaryKey ? (
                                        <span title="Chave Primária">
                                          <Key className="w-3 h-3 text-amber-500" />
                                        </span>
                                      ) : col.isForeignKey ? (
                                        <span title="Chave Estrangeira">
                                          <LinkIcon className="w-3 h-3 text-blue-500" />
                                        </span>
                                      ) : null}
                                      <span>{col.name}</span>
                                      <span className="text-[10px] font-normal text-slate-400 font-mono">
                                        {col.type}
                                      </span>
                                    </div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                              {activeTableData?.isLoading ? (
                                <tr>
                                  <td
                                    colSpan={activeTable.columns.length + 1}
                                    className="py-16 text-center text-slate-400"
                                  >
                                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                                    <span>Carregando registros...</span>
                                  </td>
                                </tr>
                              ) : !activeTableData || activeTableData.rows.length === 0 ? (
                                <tr>
                                  <td
                                    colSpan={activeTable.columns.length + 1}
                                    className="py-16 text-center text-slate-400"
                                  >
                                    Esta tabela não possui nenhum registro ainda.
                                  </td>
                                </tr>
                              ) : (
                                activeTableData.rows.map((row, idx) => {
                                  const pkStr = getRowPkString(activeTable, row);
                                  const rowPending = currentTableEdits[pkStr];
                                  const isRowModified = !!rowPending;

                                  return (
                                    <tr
                                      key={pkStr || idx}
                                      className={`transition-colors border-b border-slate-100 ${
                                        isRowModified
                                          ? 'bg-amber-50/70 hover:bg-amber-100/70'
                                          : 'hover:bg-slate-50/80'
                                      }`}
                                    >
                                      {/* Coluna # com marcador visual se a linha foi alterada */}
                                      <td className="py-2 px-3 text-slate-400 text-center text-[10px] relative select-none">
                                        {isRowModified && (
                                          <span
                                            className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-4 bg-amber-500 rounded-full"
                                            title="Linha com alterações pendentes"
                                          />
                                        )}
                                        <span className={isRowModified ? 'font-bold text-amber-800' : ''}>
                                          {(activeTableData.page - 1) * activeTableData.limit + idx + 1}
                                        </span>
                                      </td>

                                      {/* Colunas com edição inline ao dar duplo clique */}
                                      {activeTable.columns.map((col) => {
                                        const isEditingThis =
                                          editingCell?.tableName === activeTable.name &&
                                          editingCell?.rowPkString === pkStr &&
                                          editingCell?.colName === col.name;

                                        const isCellModified =
                                          isRowModified && rowPending.changes[col.name] !== undefined;
                                        const currentVal = isCellModified
                                          ? rowPending.changes[col.name]
                                          : row[col.name];

                                        return (
                                          <td
                                            key={col.name}
                                            onDoubleClick={() => {
                                              setEditingCell({
                                                tableName: activeTable.name,
                                                rowPkString: pkStr,
                                                colName: col.name,
                                                value:
                                                  currentVal === null || currentVal === undefined
                                                    ? ''
                                                    : typeof currentVal === 'object'
                                                    ? JSON.stringify(currentVal)
                                                    : String(currentVal),
                                              });
                                            }}
                                            className={`py-1.5 px-3 truncate max-w-xs cursor-pointer select-text relative transition-colors ${
                                              isCellModified
                                                ? 'bg-amber-100/80 text-amber-950 font-semibold border-b border-amber-300'
                                                : 'text-slate-800 hover:bg-blue-50/50'
                                            }`}
                                            title="Duplo clique para editar este valor"
                                          >
                                            {isEditingThis ? (
                                              <input
                                                autoFocus
                                                type="text"
                                                value={editingCell.value}
                                                onChange={(e) =>
                                                  setEditingCell((prev) =>
                                                    prev ? { ...prev, value: e.target.value } : null
                                                  )
                                                }
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') {
                                                    saveCellEdit(activeTable, row, col.name, editingCell.value);
                                                  } else if (e.key === 'Escape') {
                                                    setEditingCell(null);
                                                  }
                                                }}
                                                onBlur={() => {
                                                  if (editingCell) {
                                                    saveCellEdit(activeTable, row, col.name, editingCell.value);
                                                  }
                                                }}
                                                className="w-full px-1.5 py-0.5 text-xs font-mono bg-white border-2 border-blue-500 rounded shadow-xs outline-none text-slate-900"
                                              />
                                            ) : (
                                              <div className="flex items-center justify-between gap-1.5">
                                                <span className="truncate">
                                                  {currentVal !== null && currentVal !== undefined ? (
                                                    typeof currentVal === 'object' ? (
                                                      <span className="text-blue-600 bg-blue-50 px-1 py-0.5 rounded text-[10px]">
                                                        {JSON.stringify(currentVal)}
                                                      </span>
                                                    ) : typeof currentVal === 'boolean' ? (
                                                      <span
                                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                          currentVal
                                                            ? 'bg-emerald-50 text-emerald-700'
                                                            : 'bg-red-50 text-red-700'
                                                        }`}
                                                      >
                                                        {String(currentVal)}
                                                      </span>
                                                    ) : (
                                                      String(currentVal)
                                                    )
                                                  ) : (
                                                    <span className="text-slate-300 italic">null</span>
                                                  )}
                                                </span>
                                                {isCellModified && (
                                                  <span className="text-[9px] px-1 py-0.2 bg-amber-200 text-amber-900 rounded font-bold shrink-0">
                                                    Modificado
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* CONTROLES DE PAGINAÇÃO */}
                        {activeTableData && activeTableData.totalCount > activeTableData.limit && (
                          <div className="flex items-center justify-between pt-2">
                            <button
                              type="button"
                              onClick={() =>
                                loadTableData(
                                  activeTable.name,
                                  Math.max(1, activeTableData.page - 1),
                                  activeTableData.limit
                                )
                              }
                              disabled={activeTableData.page <= 1}
                              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-lg text-xs font-semibold"
                            >
                              Anterior
                            </button>
                            <span className="text-xs text-slate-500 font-mono">
                              Página {activeTableData.page} de{' '}
                              {Math.ceil(activeTableData.totalCount / activeTableData.limit)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                loadTableData(
                                  activeTable.name,
                                  Math.min(
                                    Math.ceil(activeTableData.totalCount / activeTableData.limit),
                                    activeTableData.page + 1
                                  ),
                                  activeTableData.limit
                                )
                              }
                              disabled={
                                activeTableData.page >=
                                Math.ceil(activeTableData.totalCount / activeTableData.limit)
                              }
                              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-lg text-xs font-semibold"
                            >
                              Próxima
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* SUB-TAB 2: ESTRUTURA, COLUNAS, RELACIONAMENTOS & ÍNDICES */}
                  {activeTab.activeSubTab === 'structure' && (() => {
                    const fks = activeTable.foreignKeys || [];
                    const deps = activeTable.dependencies || [];
                    const indexes = activeTable.indexes || [];

                    return (
                      <div className="space-y-4">
                        {/* SUB-NAVEGAÇÃO DE ESTRUTURA */}
                        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                          <button
                            type="button"
                            onClick={() => setStructureSection('columns')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              structureSection === 'columns'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <Columns className="w-3.5 h-3.5 text-blue-600" />
                            <span>Colunas & Tipos ({activeTable.columns.length})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setStructureSection('fks')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              structureSection === 'fks'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
                            <span>Chaves Estrangeiras ({fks.length})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setStructureSection('dependencies')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              structureSection === 'dependencies'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <Layers className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Dependências / Relações ({deps.length})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setStructureSection('indexes')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              structureSection === 'indexes'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                            <span>Índices & Restrições ({indexes.length})</span>
                          </button>
                        </div>

                        {/* SEÇÃO 1: COLUNAS & TIPOS */}
                        {structureSection === 'columns' && (
                          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                  <th className="py-2.5 px-4 font-mono">Coluna</th>
                                  <th className="py-2.5 px-4 font-mono">Tipo de Dado</th>
                                  <th className="py-2.5 px-4 font-mono">Nulo?</th>
                                  <th className="py-2.5 px-4 font-mono">Padrão (Default)</th>
                                  <th className="py-2.5 px-4 font-mono">Chaves / Restrições</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                                {activeTable.columns.map((col) => {
                                  const fk = fks.find((f) => f.column === col.name);
                                  return (
                                    <tr key={col.name} className="hover:bg-slate-50/70">
                                      <td className="py-2.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                                        {col.isPrimaryKey ? (
                                          <span title="Chave Primária">
                                            <Key className="w-3.5 h-3.5 text-amber-500" />
                                          </span>
                                        ) : col.isForeignKey ? (
                                          <span title="Chave Estrangeira">
                                            <LinkIcon className="w-3.5 h-3.5 text-blue-500" />
                                          </span>
                                        ) : (
                                          <span className="w-3.5 h-3.5" />
                                        )}
                                        <span>{col.name}</span>
                                      </td>
                                      <td className="py-2.5 px-4 text-blue-600 font-semibold">{col.type}</td>
                                      <td className="py-2.5 px-4">
                                        {col.nullable ? (
                                          <span className="text-slate-400">Sim</span>
                                        ) : (
                                          <span className="text-red-600 font-bold">Não (NOT NULL)</span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-4 text-slate-500 truncate max-w-xs">
                                        {col.defaultValue || <span className="text-slate-300">-</span>}
                                      </td>
                                      <td className="py-2.5 px-4">
                                        {col.isPrimaryKey && (
                                          <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[10px] font-bold mr-2">
                                            PRIMARY KEY
                                          </span>
                                        )}
                                        {fk && (
                                          <button
                                            type="button"
                                            onClick={() => openTableTab(fk.referencedTable)}
                                            className="px-2 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded text-[10px] font-bold flex items-center gap-1"
                                          >
                                            <span>
                                              FK → {fk.referencedTable}.{fk.referencedColumn}
                                            </span>
                                            <ExternalLink className="w-2.5 h-2.5" />
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* SEÇÃO 2: CHAVES ESTRANGEIRAS (RELAÇÕES DE SAÍDA) */}
                        {structureSection === 'fks' && (
                          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                            {fks.length === 0 ? (
                              <div className="py-12 text-center text-slate-400 font-mono text-xs">
                                Esta tabela não possui nenhuma chave estrangeira (FK) de saída.
                              </div>
                            ) : (
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                    <th className="py-2.5 px-4 font-mono">Constraint</th>
                                    <th className="py-2.5 px-4 font-mono">Coluna Local</th>
                                    <th className="py-2.5 px-4 font-mono">Tabela de Destino</th>
                                    <th className="py-2.5 px-4 font-mono">Coluna de Destino</th>
                                    <th className="py-2.5 px-4 font-mono">Regra On Delete</th>
                                    <th className="py-2.5 px-4 font-mono">Regra On Update</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                                  {fks.map((fk, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/70">
                                      <td className="py-2.5 px-4 text-slate-500 font-semibold truncate max-w-xs">
                                        {fk.constraintName || '-'}
                                      </td>
                                      <td className="py-2.5 px-4 font-bold text-slate-900 flex items-center gap-1.5">
                                        <LinkIcon className="w-3.5 h-3.5 text-blue-500" />
                                        <span>{fk.column}</span>
                                      </td>
                                      <td className="py-2.5 px-4">
                                        <button
                                          type="button"
                                          onClick={() => openTableTab(fk.referencedTable)}
                                          className="text-blue-600 hover:text-blue-800 font-bold hover:underline flex items-center gap-1"
                                        >
                                          <span>{fk.referencedTable}</span>
                                          <ExternalLink className="w-3 h-3" />
                                        </button>
                                      </td>
                                      <td className="py-2.5 px-4 text-emerald-700 font-bold">
                                        {fk.referencedColumn}
                                      </td>
                                      <td className="py-2.5 px-4">
                                        <span
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                            fk.onDelete === 'CASCADE'
                                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                                              : fk.onDelete === 'SET NULL'
                                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                                              : 'bg-slate-100 text-slate-700 border-slate-200'
                                          }`}
                                        >
                                          {fk.onDelete || 'NO ACTION'}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-4">
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-[10px] font-bold">
                                          {fk.onUpdate || 'NO ACTION'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}

                        {/* SEÇÃO 3: DEPENDÊNCIAS (TABELAS EXTERNAS QUE REFERENCIAM ESTA) */}
                        {structureSection === 'dependencies' && (
                          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                            {deps.length === 0 ? (
                              <div className="py-12 text-center text-slate-400 font-mono text-xs">
                                Nenhuma tabela externa possui chave estrangeira apontando para "{activeTable.name}".
                              </div>
                            ) : (
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                    <th className="py-2.5 px-4 font-mono">Tabela Dependente</th>
                                    <th className="py-2.5 px-4 font-mono">Coluna Estrangeira</th>
                                    <th className="py-2.5 px-4 font-mono">Aponta para (Nesta Tabela)</th>
                                    <th className="py-2.5 px-4 font-mono">Constraint</th>
                                    <th className="py-2.5 px-4 font-mono">Comportamento On Delete</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                                  {deps.map((dep, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/70">
                                      <td className="py-2.5 px-4">
                                        <button
                                          type="button"
                                          onClick={() => openTableTab(dep.fromTable)}
                                          className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline flex items-center gap-1.5"
                                        >
                                          <Table2 className="w-3.5 h-3.5" />
                                          <span>{dep.fromTable}</span>
                                          <ExternalLink className="w-3 h-3" />
                                        </button>
                                      </td>
                                      <td className="py-2.5 px-4 font-bold text-slate-800">
                                        {dep.fromColumn}
                                      </td>
                                      <td className="py-2.5 px-4 font-bold text-emerald-700">
                                        {dep.toColumn}
                                      </td>
                                      <td className="py-2.5 px-4 text-slate-500 truncate max-w-xs">
                                        {dep.constraintName || '-'}
                                      </td>
                                      <td className="py-2.5 px-4">
                                        <span
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                            dep.onDelete === 'CASCADE'
                                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                                              : dep.onDelete === 'SET NULL'
                                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                                              : 'bg-slate-100 text-slate-700 border-slate-200'
                                          }`}
                                        >
                                          {dep.onDelete || 'NO ACTION'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}

                        {/* SEÇÃO 4: ÍNDICES E RESTRIÇÕES */}
                        {structureSection === 'indexes' && (
                          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                            {indexes.length === 0 ? (
                              <div className="py-12 text-center text-slate-400 font-mono text-xs">
                                Nenhum índice encontrado para esta tabela.
                              </div>
                            ) : (
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                    <th className="py-2.5 px-4 font-mono">Nome do Índice</th>
                                    <th className="py-2.5 px-4 font-mono">Colunas Cobertas</th>
                                    <th className="py-2.5 px-4 font-mono">Tipo de Acesso</th>
                                    <th className="py-2.5 px-4 font-mono">Unicidade</th>
                                    <th className="py-2.5 px-4 font-mono">Chave Primária?</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                                  {indexes.map((idx, i) => (
                                    <tr key={i} className="hover:bg-slate-50/70">
                                      <td className="py-2.5 px-4 font-bold text-slate-900 flex items-center gap-1.5">
                                        <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                                        <span>{idx.name}</span>
                                      </td>
                                      <td className="py-2.5 px-4 text-blue-600 font-semibold font-mono">
                                        {Array.isArray(idx.columns) ? idx.columns.join(', ') : String(idx.columns)}
                                      </td>
                                      <td className="py-2.5 px-4 font-mono uppercase text-slate-600 text-[11px]">
                                        <span className="px-2 py-0.5 bg-slate-100 rounded border border-slate-200">
                                          {idx.type || 'BTREE'}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-4">
                                        {idx.isUnique ? (
                                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[10px] font-bold">
                                            UNIQUE
                                          </span>
                                        ) : (
                                          <span className="text-slate-400 text-[11px]">INDEX COMUM</span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-4">
                                        {idx.isPrimary ? (
                                          <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[10px] font-bold">
                                            PRIMARY KEY
                                          </span>
                                        ) : (
                                          <span className="text-slate-300">-</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* SUB-TAB 3: DIAGRAMA MER FOCADO NA TABELA ATIVA */}
                  {activeTab.activeSubTab === 'mer' && catalog && (
                    <DatabaseDiagramMER
                      tables={catalog.tables}
                      databaseName={catalog.databaseName}
                      focusedTableName={activeTable.name}
                      onSelectTable={(tblName) => openTableTab(tblName, 'mer')}
                    />
                  )}

                  {/* SUB-TAB 4: DDL / SQL */}
                  {activeTab.activeSubTab === 'ddl' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700">Definição SQL (DDL)</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(generateDDL(activeTable), 'ddl')}
                          className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                        >
                          {copiedKey === 'ddl' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>Copiar DDL</span>
                        </button>
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden h-[450px]">
                        <Editor
                          height="100%"
                          language="sql"
                          theme="light"
                          value={generateDDL(activeTable)}
                          options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            fontSize: 12,
                            fontFamily: "'Fira Code', Consolas, monospace",
                            lineNumbers: 'on',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab.type === 'sql' ? (
              /* MODO ABA DE CONSULTA SQL */
              <div className="flex-1 flex flex-col min-h-0 bg-white">
                {/* Toolbar do Editor SQL */}
                <div className="h-10 bg-slate-50 border-b border-slate-200 px-4 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={executeActiveSqlQuery}
                      disabled={activeTab.isExecuting}
                      className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{activeTab.isExecuting ? 'Executando...' : 'Executar (Ctrl+Enter)'}</span>
                    </button>

                    <div className="h-4 w-px bg-slate-200" />

                    <span className="text-xs text-slate-500 font-mono">
                      Banco: <strong className="text-slate-800">{catalog?.databaseName}</strong>
                    </span>
                  </div>

                  {activeTab.result && (
                    <span className="text-xs text-emerald-700 font-mono font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>
                        {activeTab.result.rowCount} linha(s) em {activeTab.result.durationMs}ms
                      </span>
                    </span>
                  )}
                </div>

                {/* Editor Monaco SQL */}
                <div className="h-56 border-b border-slate-200 relative">
                  <Editor
                    height="100%"
                    language="sql"
                    theme="light"
                    value={activeTab.query || ''}
                    onChange={(val) => {
                      setTabs((prev) =>
                        prev.map((t) => (t.id === activeTab.id ? { ...t, query: val ?? '' } : t))
                      );
                    }}
                    onMount={(editor, monaco) => {
                      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                        executeActiveSqlQuery();
                      });
                    }}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      fontFamily: "'Fira Code', Consolas, monospace",
                      lineNumbers: 'on',
                      wordWrap: 'on',
                    }}
                  />
                </div>

                {/* Mensagem de Erro de Execução */}
                {activeTab.error && (
                  <div className="p-3 bg-red-50 border-b border-red-200 flex items-center gap-2 text-xs text-red-600 font-mono">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{activeTab.error}</span>
                  </div>
                )}

                {/* Resultado da Query SQL (Grid de Resultados) */}
                <div className="flex-1 overflow-auto p-4 bg-slate-50">
                  {activeTab.result && activeTab.result.rows.length > 0 ? (
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 shadow-2xs">
                            <th className="py-2 px-3 w-10 text-slate-400 font-mono text-center">#</th>
                            {Object.keys(activeTab.result.rows[0]).map((colName) => (
                              <th key={colName} className="py-2.5 px-3 font-mono">
                                {colName}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                          {activeTab.result.rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-2 px-3 text-slate-400 text-center text-[10px]">{idx + 1}</td>
                              {activeTab.result?.rows?.[0] ? Object.keys(activeTab.result.rows[0]).map((colName) => {
                                const val = row[colName];
                                return (
                                  <td key={colName} className="py-2 px-3 text-slate-800 truncate max-w-xs">
                                    {val !== null && val !== undefined ? (
                                      typeof val === 'object' ? (
                                        JSON.stringify(val)
                                      ) : (
                                        String(val)
                                      )
                                    ) : (
                                      <span className="text-slate-300 italic">null</span>
                                    )}
                                  </td>
                                );
                              }) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : activeTab.result ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      Consulta executada com sucesso. Nenhuma linha retornada.
                    </div>
                  ) : (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      Pressione <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono font-bold">Ctrl+Enter</kbd> para executar a query.
                    </div>
                  )}
                </div>
              </div>
            ) : null
          ) : (
            /* Nenhum Aba Aberta */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50">
              <div className="w-16 h-16 rounded-3xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4 shadow-sm">
                <Database className="w-8 h-8" />
              </div>
              <h2 className="text-base font-bold text-slate-800 mb-1">Database Studio</h2>
              <p className="text-xs text-slate-500 max-w-md mb-6 leading-relaxed">
                Nenhuma tabela ou consulta aberta no momento. Selecione uma tabela na árvore da esquerda ou abra uma nova consulta SQL.
              </p>
              <button
                type="button"
                onClick={() => openNewSqlTab()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Consulta SQL</span>
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};