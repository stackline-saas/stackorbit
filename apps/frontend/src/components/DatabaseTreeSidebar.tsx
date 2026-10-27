import React, { useState, useMemo, useCallback } from 'react';
import {
  Table as TableIcon,
  ChevronRight,
  ChevronDown,
  Key,
  Link2,
  Hash,
  Type,
  Calendar,
  CheckSquare,
  Braces,
  Columns,
  Search,
  X,
  Terminal,
  Copy,
  Check,
  Eye,
  Code2,
  Folder,
  FolderOpen,
  ChevronsUpDown,
  ChevronsDownUp,
  RefreshCw,
  Layers,
  Database,
  ExternalLink,
} from 'lucide-react';
import type { DatabaseCatalog, DatabaseTable, DatabaseColumn } from '../types/index.ts';

interface DatabaseTreeSidebarProps {
  catalog: DatabaseCatalog | null;
  activeTableName?: string;
  openTableNames: string[];
  onOpenTable: (tableName: string) => void;
  onOpenSql: (query?: string, title?: string) => void;
  onRefresh: () => void;
  serviceName?: string;
  servicePort?: number;
  copiedKey: string | null;
  onCopy: (text: string, label: string) => void;
}

/** Formata número de registros amigável (ex: 1.2k rows, 450 rows) */
function formatRows(count?: number): string {
  if (count === undefined || count === null || count < 0) return '0 rows';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M reg`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k reg`;
  return `${count} reg`;
}

/** Retorna ícone temático e cor para o tipo de dado da coluna */
function renderColumnTypeIcon(col: DatabaseColumn) {
  if (col.isPrimaryKey) {
    return <Key className="w-3 h-3 text-amber-500 shrink-0" />;
  }
  if (col.isForeignKey) {
    return <Link2 className="w-3 h-3 text-blue-500 shrink-0" />;
  }

  const type = (col.type || '').toLowerCase();
  if (
    type.includes('int') ||
    type.includes('num') ||
    type.includes('float') ||
    type.includes('decimal') ||
    type.includes('double') ||
    type.includes('serial')
  ) {
    return <Hash className="w-3 h-3 text-purple-500 shrink-0" />;
  }
  if (type.includes('char') || type.includes('text') || type.includes('varchar') || type.includes('string')) {
    return <Type className="w-3 h-3 text-slate-500 shrink-0" />;
  }
  if (type.includes('date') || type.includes('time')) {
    return <Calendar className="w-3 h-3 text-emerald-500 shrink-0" />;
  }
  if (type.includes('bool')) {
    return <CheckSquare className="w-3 h-3 text-teal-500 shrink-0" />;
  }
  if (type.includes('json')) {
    return <Braces className="w-3 h-3 text-orange-500 shrink-0" />;
  }

  return <Columns className="w-3 h-3 text-slate-400 shrink-0" />;
}

export const DatabaseTreeSidebar: React.FC<DatabaseTreeSidebarProps> = ({
  catalog,
  activeTableName,
  openTableNames,
  onOpenTable,
  onOpenSql,
  onRefresh,
  serviceName,
  servicePort,
  copiedKey,
  onCopy,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Nós expandidos na árvore
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    initial.add('folder-tables');
    initial.add('folder-views');
    initial.add('folder-functions');
    return initial;
  });

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const toggleTableNode = useCallback((tableName: string) => {
    const tableNodeId = `table-${tableName}`;
    const colsNodeId = `cols-${tableName}`;
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(tableNodeId)) {
        next.delete(tableNodeId);
        next.delete(colsNodeId);
      } else {
        next.add(tableNodeId);
        next.add(colsNodeId); // auto expande colunas ao abrir a tabela
      }
      return next;
    });
  }, []);

  // Filtragem inteligente de tabelas, colunas, views e funções
  const { filteredTables, filteredViews, filteredFunctions, matchingColMap } = useMemo(() => {
    if (!catalog) {
      return {
        filteredTables: [],
        filteredViews: [],
        filteredFunctions: [],
        matchingColMap: new Map<string, Set<string>>(),
      };
    }

    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return {
        filteredTables: catalog.tables || [],
        filteredViews: catalog.views || [],
        filteredFunctions: catalog.functions || [],
        matchingColMap: new Map<string, Set<string>>(),
      };
    }

    const matchingCols = new Map<string, Set<string>>();

    const tables = (catalog.tables || []).filter((tbl) => {
      const nameMatch = tbl.name.toLowerCase().includes(term);
      const matchedCols = new Set<string>();

      (tbl.columns || []).forEach((c) => {
        if (c.name.toLowerCase().includes(term) || (c.type && c.type.toLowerCase().includes(term))) {
          matchedCols.add(c.name);
        }
      });

      if (matchedCols.size > 0) {
        matchingCols.set(tbl.name, matchedCols);
      }

      return nameMatch || matchedCols.size > 0;
    });

    const views = (catalog.views || []).filter((v) => v.toLowerCase().includes(term));
    const functions = (catalog.functions || []).filter((f) => f.toLowerCase().includes(term));

    return {
      filteredTables: tables,
      filteredViews: views,
      filteredFunctions: functions,
      matchingColMap: matchingCols,
    };
  }, [catalog, searchTerm]);

  // Se o usuário estiver buscando, auto-expande tabelas que tiverem colunas compatíveis
  const isSearching = searchTerm.trim().length > 0;

  // Expandir Tudo
  const expandAll = useCallback(() => {
    if (!catalog) return;
    const all = new Set<string>();
    all.add('folder-tables');
    all.add('folder-views');
    all.add('folder-functions');

    (catalog.tables || []).forEach((t) => {
      all.add(`table-${t.name}`);
      all.add(`cols-${t.name}`);
      all.add(`keys-${t.name}`);
    });

    setExpandedNodes(all);
  }, [catalog]);

  // Recolher Tudo
  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  const totalTables = catalog?.tables?.length || 0;
  const totalViews = catalog?.views?.length || 0;
  const totalFunctions = catalog?.functions?.length || 0;

  return (
    <aside className="w-72 md:w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 select-none text-slate-800">
      {/* 1. TOPO DA SIDEBAR: BUSCA & AÇÕES RÁPIDAS DA ÁRVORE */}
      <div className="p-3 border-b border-slate-200 bg-slate-50/70 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <Database className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="text-xs font-bold text-slate-800 truncate" title={catalog?.databaseName}>
              {catalog?.databaseName || 'Catálogo'}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-200 text-slate-600 rounded font-bold uppercase shrink-0">
              {catalog?.databaseType || 'SQL'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={expandAll}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"
              title="Expandir todas as pastas e tabelas"
            >
              <ChevronsUpDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"
              title="Recolher toda a árvore"
            >
              <ChevronsDownUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-200 rounded transition-colors"
              title="Recarregar catálogo"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Input de Busca na Árvore */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar tabelas, colunas, views..."
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-slate-800 shadow-2xs"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
              title="Limpar busca"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Resumo da busca quando ativa */}
        {isSearching && (
          <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between px-1">
            <span>Resultados da busca:</span>
            <span>
              {filteredTables.length} tab • {filteredViews.length} views
            </span>
          </div>
        )}
      </div>

      {/* 2. ÁRVORE DE OBJETOS HIERÁRQUICA (ESTILO DBEAVER / DATAGRIP) */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
        {/* ========================================================
            PASTA 1: TABELAS
           ======================================================== */}
        <div className="space-y-0.5">
          <div
            onClick={() => toggleNode('folder-tables')}
            className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-100 cursor-pointer text-slate-700 font-bold text-[11px] uppercase tracking-wider group"
          >
            <div className="flex items-center gap-1.5">
              {expandedNodes.has('folder-tables') ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              )}
              {expandedNodes.has('folder-tables') ? (
                <FolderOpen className="w-3.5 h-3.5 text-blue-600" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-blue-600" />
              )}
              <span>Tabelas</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-200/80 text-slate-600 rounded-full font-bold">
              {filteredTables.length}
            </span>
          </div>

          {/* Lista de Tabelas Expandida */}
          {expandedNodes.has('folder-tables') && (
            <div className="ml-2 pl-2 border-l border-slate-200/80 space-y-0.5 mt-0.5">
              {filteredTables.length === 0 ? (
                <div className="py-2 px-2 text-[11px] text-slate-400 italic">
                  {isSearching ? 'Nenhuma tabela correspondente.' : 'Nenhuma tabela encontrada.'}
                </div>
              ) : (
                filteredTables.map((tbl) => {
                  const tableNodeId = `table-${tbl.name}`;
                  const colsNodeId = `cols-${tbl.name}`;
                  const keysNodeId = `keys-${tbl.name}`;

                  const isTableExpanded =
                    expandedNodes.has(tableNodeId) ||
                    (isSearching && (matchingColMap.get(tbl.name)?.size || 0) > 0);
                  const isColsExpanded =
                    expandedNodes.has(colsNodeId) ||
                    (isSearching && (matchingColMap.get(tbl.name)?.size || 0) > 0);
                  const isKeysExpanded = expandedNodes.has(keysNodeId);

                  const isTabOpen = openTableNames.includes(tbl.name);
                  const isCurrentActive = activeTableName === tbl.name;
                  const matchedCols = matchingColMap.get(tbl.name);

                  const totalKeys = (tbl.primaryKeys?.length || 0) + (tbl.foreignKeys?.length || 0);

                  return (
                    <div key={tbl.name} className="space-y-0.5">
                      {/* Linha da Tabela */}
                      <div
                        className={`group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                          isCurrentActive
                            ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200 shadow-2xs'
                            : isTabOpen
                            ? 'bg-slate-100/90 text-slate-900 font-medium'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                        onClick={() => onOpenTable(tbl.name)}
                        title={`Tabela: ${tbl.name} • ${tbl.columns.length} colunas • ${formatRows(tbl.rowsEstimate)}`}
                      >
                        {/* Chevron dobrável + Ícone + Nome */}
                        <div className="flex items-center gap-1.5 min-w-0 pr-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTableNode(tbl.name);
                            }}
                            className="p-0.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200/60"
                            title={isTableExpanded ? 'Recolher colunas' : 'Expandir colunas'}
                          >
                            {isTableExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </button>

                          <TableIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="truncate text-xs">{tbl.name}</span>
                        </div>

                        {/* Badges & Ações Rápidas (Hover) */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Badge de Estimativa de Registros */}
                          <span
                            className="text-[10px] text-slate-400 group-hover:hidden font-sans px-1 bg-slate-100 rounded border border-slate-200/60"
                            title={`Estimativa: ${tbl.rowsEstimate || 0} registros`}
                          >
                            {formatRows(tbl.rowsEstimate)}
                          </span>

                          {/* Botões de Ação no Hover */}
                          <div className="hidden group-hover:flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenSql(`SELECT * FROM "${tbl.name}" LIMIT 50;`, tbl.name);
                              }}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-100/60 rounded"
                              title="Abrir Consulta SQL (SELECT * ... LIMIT 50)"
                            >
                              <Terminal className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onCopy(tbl.name, tbl.name);
                              }}
                              className="p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded"
                              title="Copiar nome da tabela"
                            >
                              {copiedKey === tbl.name ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Sub-Árvore da Tabela (Colunas e Chaves) */}
                      {isTableExpanded && (
                        <div className="ml-4 pl-2 border-l border-slate-200/90 space-y-1 py-0.5">
                          {/* SUBPASTA: COLUNAS */}
                          <div className="space-y-0.5">
                            <div
                              onClick={() => toggleNode(colsNodeId)}
                              className="flex items-center justify-between px-1.5 py-0.5 rounded text-[11px] text-slate-500 hover:bg-slate-100 cursor-pointer font-medium"
                            >
                              <div className="flex items-center gap-1">
                                {isColsExpanded ? (
                                  <ChevronDown className="w-3 h-3 text-slate-400" />
                                ) : (
                                  <ChevronRight className="w-3 h-3 text-slate-400" />
                                )}
                                <Columns className="w-3 h-3 text-slate-500" />
                                <span>Colunas</span>
                              </div>
                              <span className="text-[10px] text-slate-400">({tbl.columns.length})</span>
                            </div>

                            {/* Lista de Colunas */}
                            {isColsExpanded && (
                              <div className="ml-3 pl-1.5 border-l border-slate-200/70 space-y-0.5">
                                {tbl.columns.map((col) => {
                                  const isColMatched = matchedCols?.has(col.name);

                                  return (
                                    <div
                                      key={col.name}
                                      onClick={() => onCopy(col.name, `${tbl.name}.${col.name}`)}
                                      className={`group flex items-center justify-between px-1.5 py-0.5 rounded text-[11px] hover:bg-slate-100 cursor-pointer transition-colors ${
                                        isColMatched ? 'bg-amber-50 text-amber-900 font-bold' : 'text-slate-600'
                                      }`}
                                      title={`${col.name}: ${col.type}${col.isPrimaryKey ? ' [PRIMARY KEY]' : ''}${
                                        col.isForeignKey ? ' [FOREIGN KEY]' : ''
                                      } • ${col.nullable ? 'NULL' : 'NOT NULL'}${
                                        col.defaultValue ? ` • Default: ${col.defaultValue}` : ''
                                      }`}
                                    >
                                      {/* Ícone de Tipo + Nome */}
                                      <div className="flex items-center gap-1.5 truncate pr-1">
                                        {renderColumnTypeIcon(col)}
                                        <span
                                          className={`truncate ${
                                            col.isPrimaryKey ? 'font-bold text-slate-800' : ''
                                          }`}
                                        >
                                          {col.name}
                                        </span>
                                      </div>

                                      {/* Tipo e Indicador */}
                                      <div className="flex items-center gap-1 shrink-0 text-[10px]">
                                        {col.isPrimaryKey && (
                                          <span className="px-1 py-0.2 bg-amber-100 text-amber-700 font-bold rounded text-[9px]">
                                            PK
                                          </span>
                                        )}
                                        {col.isForeignKey && (
                                          <span className="px-1 py-0.2 bg-blue-100 text-blue-700 font-bold rounded text-[9px]">
                                            FK
                                          </span>
                                        )}
                                        <span className="text-slate-400 truncate max-w-[85px] font-sans">
                                          {col.type?.split('(')[0]}
                                        </span>
                                        <span className="hidden group-hover:inline text-slate-400">
                                          {copiedKey === `${tbl.name}.${col.name}` ? (
                                            <Check className="w-2.5 h-2.5 text-emerald-600" />
                                          ) : (
                                            <Copy className="w-2.5 h-2.5" />
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* SUBPASTA: CHAVES & CONSTRAINTS */}
                          {totalKeys > 0 && (
                            <div className="space-y-0.5">
                              <div
                                onClick={() => toggleNode(keysNodeId)}
                                className="flex items-center justify-between px-1.5 py-0.5 rounded text-[11px] text-slate-500 hover:bg-slate-100 cursor-pointer font-medium"
                              >
                                <div className="flex items-center gap-1">
                                  {isKeysExpanded ? (
                                    <ChevronDown className="w-3 h-3 text-slate-400" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3 text-slate-400" />
                                  )}
                                  <Key className="w-3 h-3 text-amber-500" />
                                  <span>Chaves & FKs</span>
                                </div>
                                <span className="text-[10px] text-slate-400">({totalKeys})</span>
                              </div>

                              {/* Lista de Chaves */}
                              {isKeysExpanded && (
                                <div className="ml-3 pl-1.5 border-l border-slate-200/70 space-y-0.5">
                                  {/* Primary Keys */}
                                  {tbl.primaryKeys?.map((pkCol) => (
                                    <div
                                      key={`pk-${pkCol}`}
                                      className="flex items-center gap-1.5 px-1.5 py-0.5 text-[10px] text-amber-700 bg-amber-50/60 rounded"
                                      title={`Chave Primária: ${pkCol}`}
                                    >
                                      <Key className="w-3 h-3 text-amber-500 shrink-0" />
                                      <span className="font-bold">PK</span>
                                      <span className="text-slate-700 truncate">({pkCol})</span>
                                    </div>
                                  ))}

                                  {/* Foreign Keys */}
                                  {tbl.foreignKeys?.map((fk, idx) => (
                                    <div
                                      key={`fk-${idx}-${fk.column}`}
                                      className="flex items-center gap-1.5 px-1.5 py-0.5 text-[10px] text-blue-700 bg-blue-50/60 rounded cursor-pointer hover:bg-blue-100/60"
                                      onClick={() => onOpenTable(fk.referencedTable)}
                                      title={`FK: ${fk.column} -> ${fk.referencedTable}.${fk.referencedColumn}`}
                                    >
                                      <Link2 className="w-3 h-3 text-blue-500 shrink-0" />
                                      <span className="truncate">
                                        {fk.column} ➜ {fk.referencedTable}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ========================================================
            PASTA 2: VIEWS
           ======================================================== */}
        <div className="space-y-0.5 pt-1">
          <div
            onClick={() => toggleNode('folder-views')}
            className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-100 cursor-pointer text-slate-700 font-bold text-[11px] uppercase tracking-wider group"
          >
            <div className="flex items-center gap-1.5">
              {expandedNodes.has('folder-views') ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              )}
              <Eye className="w-3.5 h-3.5 text-emerald-600" />
              <span>Views</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-200/80 text-slate-600 rounded-full font-bold">
              {filteredViews.length}
            </span>
          </div>

          {expandedNodes.has('folder-views') && (
            <div className="ml-2 pl-2 border-l border-slate-200/80 space-y-0.5 mt-0.5">
              {filteredViews.length === 0 ? (
                <div className="py-1 px-2 text-[11px] text-slate-400 italic">
                  Nenhuma view encontrada.
                </div>
              ) : (
                filteredViews.map((vw) => (
                  <div
                    key={vw}
                    onClick={() => onOpenSql(`SELECT * FROM "${vw}" LIMIT 50;`, vw)}
                    className="group flex items-center justify-between px-2 py-1 rounded-lg text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer transition-colors"
                    title={`View: ${vw} (Clique para abrir Consulta)`}
                  >
                    <div className="flex items-center gap-1.5 truncate pr-1">
                      <Eye className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span className="truncate">{vw}</span>
                    </div>

                    <div className="hidden group-hover:flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSql(`SELECT * FROM "${vw}" LIMIT 50;`, vw);
                        }}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded"
                        title="Consultar View"
                      >
                        <Terminal className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCopy(vw, vw);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-800 rounded"
                        title="Copiar nome da view"
                      >
                        {copiedKey === vw ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ========================================================
            PASTA 3: FUNÇÕES & PROCEDURES
           ======================================================== */}
        <div className="space-y-0.5 pt-1">
          <div
            onClick={() => toggleNode('folder-functions')}
            className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-slate-100 cursor-pointer text-slate-700 font-bold text-[11px] uppercase tracking-wider group"
          >
            <div className="flex items-center gap-1.5">
              {expandedNodes.has('folder-functions') ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              )}
              <Code2 className="w-3.5 h-3.5 text-purple-600" />
              <span>Funções / Routines</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-200/80 text-slate-600 rounded-full font-bold">
              {filteredFunctions.length}
            </span>
          </div>

          {expandedNodes.has('folder-functions') && (
            <div className="ml-2 pl-2 border-l border-slate-200/80 space-y-0.5 mt-0.5">
              {filteredFunctions.length === 0 ? (
                <div className="py-1 px-2 text-[11px] text-slate-400 italic">
                  Nenhuma função encontrada.
                </div>
              ) : (
                filteredFunctions.map((fn) => (
                  <div
                    key={fn}
                    onClick={() => onOpenSql(`SELECT ${fn}();`, fn)}
                    className="group flex items-center justify-between px-2 py-1 rounded-lg text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer transition-colors"
                    title={`Função: ${fn}()`}
                  >
                    <div className="flex items-center gap-1.5 truncate pr-1">
                      <span className="text-[11px] text-purple-600 font-serif font-bold italic shrink-0">ƒ(x)</span>
                      <span className="truncate">{fn}()</span>
                    </div>

                    <div className="hidden group-hover:flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSql(`SELECT ${fn}();`, fn);
                        }}
                        className="p-1 text-slate-400 hover:text-purple-600 rounded"
                        title="Executar função SQL"
                      >
                        <Terminal className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCopy(fn, fn);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-800 rounded"
                        title="Copiar nome da função"
                      >
                        {copiedKey === fn ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. RODAPÉ DA SIDEBAR: INFORMAÇÕES DE CONEXÃO & PORTA */}
      <div className="p-2.5 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
        <div className="flex items-center gap-1.5 truncate">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Conexão ativa" />
          <span className="font-mono truncate">{catalog?.version?.split(' ')[0] || 'SQL'}</span>
        </div>
        <span className="font-mono text-slate-400 shrink-0">:{servicePort || 5432}</span>
      </div>
    </aside>
  );
};
