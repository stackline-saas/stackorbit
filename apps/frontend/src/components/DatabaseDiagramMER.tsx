import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Key,
  Link as LinkIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Search,
  Layers,
  Sparkles,
  Focus,
  Globe,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Move,
  RotateCcw,
} from 'lucide-react';
import type { DatabaseTable, DatabaseForeignKey, DatabaseColumn } from '../types/index.ts';

interface DatabaseDiagramMERProps {
  tables: DatabaseTable[];
  databaseName: string;
  focusedTableName?: string;
  onSelectTable?: (tableName: string) => void;
}

interface TablePosition {
  x: number;
  y: number;
}

export const DatabaseDiagramMER: React.FC<DatabaseDiagramMERProps> = ({
  tables,
  databaseName,
  focusedTableName,
  onSelectTable,
}) => {
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [positions, setPositions] = useState<Record<string, TablePosition>>({});
  const [selectedTable, setSelectedTable] = useState<string | null>(focusedTableName || null);
  const [hoveredLine, setHoveredLine] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewScope, setViewScope] = useState<'focused' | 'all'>(focusedTableName ? 'focused' : 'all');

  // Dragging individual tables vs dragging canvas background
  const [draggingTable, setDraggingTable] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanningCanvas, setIsPanningCanvas] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Expansão de colunas por tabela
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  const containerRef = useRef<HTMLDivElement>(null);

  // Calcula tabelas relacionadas à tabela em foco
  const { relatedTableNames, incomingTables, outgoingTables } = useMemo(() => {
    if (!focusedTableName) {
      return {
        relatedTableNames: new Set<string>(),
        incomingTables: [] as DatabaseTable[],
        outgoingTables: [] as DatabaseTable[],
      };
    }

    const currentTbl = tables.find((t) => t.name === focusedTableName);
    const outgoingNames = new Set<string>((currentTbl?.foreignKeys || []).map((fk) => fk.referencedTable));
    const outgoing = tables.filter((t) => outgoingNames.has(t.name) && t.name !== focusedTableName);

    const incoming = tables.filter(
      (t) => t.name !== focusedTableName && t.foreignKeys.some((fk) => fk.referencedTable === focusedTableName)
    );

    const allRelated = new Set<string>([
      focusedTableName,
      ...outgoing.map((t) => t.name),
      ...incoming.map((t) => t.name),
    ]);

    return {
      relatedTableNames: allRelated,
      incomingTables: incoming,
      outgoingTables: outgoing,
    };
  }, [tables, focusedTableName]);

  // Lista de tabelas ativas a exibir
  const activeTables = useMemo(() => {
    if (viewScope === 'focused' && focusedTableName) {
      return tables.filter((t) => relatedTableNames.has(t.name));
    }
    return tables;
  }, [tables, viewScope, focusedTableName, relatedTableNames]);

  // Algoritmo de Auto-Layout Limpo e Organizado
  const calculateAutoLayout = useCallback(() => {
    const newPos: Record<string, TablePosition> = {};

    if (viewScope === 'focused' && focusedTableName) {
      // 1. MODO FOCADO LIMPO (LAYOUT EM 3 COLUNAS BALANCEADAS)
      const centerTable = tables.find((t) => t.name === focusedTableName);

      // Posiciona a tabela foco com bastante destaque no centro
      const centerX = 560;
      const centerY = 160;
      newPos[focusedTableName] = { x: centerX, y: centerY };

      // Se temos tabelas de entrada (dependentes): distribuímos em 2 colunas à esquerda se forem mais de 4
      const leftTables = incomingTables;
      const rightTables = outgoingTables;

      if (leftTables.length <= 4) {
        // Coluna única à esquerda
        leftTables.forEach((tbl, idx) => {
          newPos[tbl.name] = { x: 80, y: 60 + idx * 220 };
        });
      } else {
        // Divide as tabelas em 2 colunas organizadas (Coluna A e Coluna B)
        const half = Math.ceil(leftTables.length / 2);
        leftTables.slice(0, half).forEach((tbl, idx) => {
          newPos[tbl.name] = { x: 40, y: 60 + idx * 210 };
        });
        leftTables.slice(half).forEach((tbl, idx) => {
          newPos[tbl.name] = { x: 300, y: 60 + idx * 210 };
        });
      }

      // Tabelas de saída (pais referenciados) à direita do centro
      if (rightTables.length > 0) {
        rightTables.forEach((tbl, idx) => {
          newPos[tbl.name] = { x: centerX + 340, y: 60 + idx * 220 };
        });
      } else if (leftTables.length > 8) {
        // Se a direita está vazia e temos muitos itens à esquerda, movemos metade para a direita para equilibrar!
        const extraHalf = Math.floor(leftTables.length / 2);
        leftTables.slice(extraHalf).forEach((tbl, idx) => {
          newPos[tbl.name] = { x: centerX + 340, y: 60 + idx * 210 };
        });
      }

      setPositions(newPos);
      setPan({ x: 20, y: 20 });
    } else {
      // 2. MODO GERAL: Grid Espaçado e Limpo
      const cols = Math.max(3, Math.ceil(Math.sqrt(tables.length * 1.5)));
      const colWidth = 280;
      const rowHeight = 240;

      tables.forEach((table, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        newPos[table.name] = {
          x: 40 + col * (colWidth + 70),
          y: 40 + row * (rowHeight + 50),
        };
      });

      setPositions(newPos);
      setPan({ x: 0, y: 0 });
    }
  }, [viewScope, focusedTableName, tables, incomingTables, outgoingTables]);

  useEffect(() => {
    calculateAutoLayout();
  }, [calculateAutoLayout]);

  // Arrastar Card de Tabela
  const handleTableMouseDown = (tableName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingTable(tableName);
    const pos = positions[tableName] || { x: 0, y: 0 };
    setDragOffset({
      x: e.clientX / zoom - pos.x,
      y: e.clientY / zoom - pos.y,
    });
  };

  // Arrastar Canvas Inteiro (Pan estilo Figma / Miro)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === 'svg') {
      setIsPanningCanvas(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingTable) {
      setPositions((prev) => ({
        ...prev,
        [draggingTable]: {
          x: Math.max(10, e.clientX / zoom - dragOffset.x),
          y: Math.max(10, e.clientY / zoom - dragOffset.y),
        },
      }));
    } else if (isPanningCanvas) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setDraggingTable(null);
    setIsPanningCanvas(false);
  };

  // Zoom via roda do mouse
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setZoom((z) => Math.min(1.8, Math.max(0.35, z + delta)));
    }
  };

  const toggleTableExpand = (tableName: string) => {
    setExpandedTables((prev) => ({
      ...prev,
      [tableName]: !prev[tableName],
    }));
  };

  const filteredTables = activeTables.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      className={`relative w-full h-[620px] bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden select-none shadow-xs ${
        isPanningCanvas ? 'cursor-grabbing' : 'cursor-default'
      }`}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      ref={containerRef}
    >
      {/* Background Grid Pattern (Miro dot pattern) */}
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(#94a3b8 1.2px, transparent 1.2px)`,
          backgroundSize: '24px 24px',
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />

      {/* Top Floating Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-30 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Badges e Modo de Visualização */}
        <div className="flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm pointer-events-auto">
          <Layers className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-bold text-slate-800">Diagrama MER</span>

          {focusedTableName && (
            <div className="flex items-center gap-1 ml-2 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewScope('focused')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  viewScope === 'focused'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Focus className="w-3 h-3" />
                <span>Relações de "{focusedTableName}" ({activeTables.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setViewScope('all')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  viewScope === 'all'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Globe className="w-3 h-3" />
                <span>Esquema Geral ({tables.length})</span>
              </button>
            </div>
          )}
        </div>

        {/* Controles de Zoom, Auto-Layout e Busca */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Botão Organizar / Auto-Layout */}
          <button
            type="button"
            onClick={calculateAutoLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold shadow-sm transition-all"
            title="Reorganizar automaticamente as tabelas em layout limpo"
          >
            <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
            <span>Reorganizar Layout</span>
          </button>

          {/* Busca de Tabela */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Localizar tabela..."
              className="pl-8 pr-3 py-1.5 text-xs bg-white text-slate-800 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono w-40 shadow-sm"
            />
          </div>

          {/* Zoom */}
          <div className="flex items-center bg-white rounded-xl border border-slate-200 p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.8, z + 0.12))}
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="px-2 text-[11px] font-mono font-bold text-slate-600">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, z - 0.12))}
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
              title="Diminuir Zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(0.85);
                setPan({ x: 20, y: 20 });
              }}
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
              title="Restaurar Visão Padrão"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* SVG Canvas de Conexões de Chaves Estrangeiras */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'top left',
        }}
      >
        <defs>
          <marker
            id="mer-arrowhead-active"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb" />
          </marker>
          <marker
            id="mer-arrowhead-muted"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
          </marker>
        </defs>

        {activeTables.map((table) => {
          const fromPos = positions[table.name];
          if (!fromPos) return null;

          return table.foreignKeys.map((fk: DatabaseForeignKey, fkIdx: number) => {
            const toPos = positions[fk.referencedTable];
            if (!toPos) return null;

            const isRelatedToFocus =
              focusedTableName && (table.name === focusedTableName || fk.referencedTable === focusedTableName);

            const lineKey = `${table.name}.${fk.column}->${fk.referencedTable}.${fk.referencedColumn}`;
            const isHovered = hoveredLine === lineKey;

            // Determina de qual lado sai e entra a linha de acordo com as posições X
            const fromLeft = fromPos.x > toPos.x;
            const startX = fromLeft ? fromPos.x : fromPos.x + 250;
            const startY = fromPos.y + 40 + (fkIdx % 4) * 18;

            const endX = fromLeft ? toPos.x + 250 : toPos.x;
            // Distribui a entrada verticalmente para não encavalar todas no mesmo ponto exato
            const endY = toPos.y + 40 + ((table.name.charCodeAt(0) + fkIdx * 7) % 50);

            const deltaX = Math.abs(endX - startX);
            const curvature = Math.max(40, deltaX * 0.45);
            const cp1X = fromLeft ? startX - curvature : startX + curvature;
            const cp2X = fromLeft ? endX + curvature : endX - curvature;

            return (
              <g key={lineKey}>
                <path
                  d={`M ${startX} ${startY} C ${cp1X} ${startY}, ${cp2X} ${endY}, ${endX} ${endY}`}
                  fill="none"
                  stroke={isHovered ? '#1d4ed8' : isRelatedToFocus ? '#3b82f6' : '#94a3b8'}
                  strokeWidth={isHovered ? '3' : isRelatedToFocus ? '2' : '1.2'}
                  strokeDasharray={isRelatedToFocus ? undefined : '5 4'}
                  markerEnd={isRelatedToFocus ? 'url(#mer-arrowhead-active)' : 'url(#mer-arrowhead-muted)'}
                  opacity={
                    selectedTable && selectedTable !== table.name && selectedTable !== fk.referencedTable ? 0.2 : 0.85
                  }
                  className="transition-all"
                />
              </g>
            );
          });
        })}
      </svg>

      {/* ÁREA TRANSFORMÁVEL COM AS TABELAS */}
      <div
        className="absolute inset-0 w-[5000px] h-[5000px]"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'top left',
        }}
      >
        {filteredTables.map((table) => {
          const pos = positions[table.name] || { x: 40, y: 40 };
          const isFocusedMain = focusedTableName === table.name;
          const isSelected = selectedTable === table.name;
          const isExpanded = !!expandedTables[table.name];

          // Separa colunas importantes (PKs e FKs) das colunas normais
          const keyColumns = table.columns.filter((c) => c.isPrimaryKey || c.isForeignKey);
          const otherColumns = table.columns.filter((c) => !c.isPrimaryKey && !c.isForeignKey);
          const displayedColumns = isExpanded
            ? table.columns
            : [...keyColumns, ...otherColumns.slice(0, Math.max(0, 4 - keyColumns.length))];
          const hiddenCount = table.columns.length - displayedColumns.length;

          return (
            <div
              key={table.name}
              onMouseDown={(e) => handleTableMouseDown(table.name, e)}
              onClick={() => setSelectedTable(table.name)}
              onDoubleClick={() => onSelectTable?.(table.name)}
              style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                width: '250px',
              }}
              className={`absolute bg-white rounded-xl shadow-md transition-shadow cursor-grab active:cursor-grabbing overflow-hidden z-20 border select-none ${
                isFocusedMain
                  ? 'border-blue-600 ring-4 ring-blue-500/25 shadow-xl'
                  : isSelected
                  ? 'border-blue-500 ring-2 ring-blue-500/30'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Header do Card da Tabela */}
              <div
                className={`px-3 py-2 border-b flex items-center justify-between ${
                  isFocusedMain
                    ? 'bg-blue-600 text-white border-blue-700'
                    : 'bg-slate-50 text-slate-800 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isFocusedMain ? 'bg-amber-300 animate-pulse' : 'bg-blue-500'
                    }`}
                  />
                  <span className="font-bold text-xs font-mono truncate">{table.name}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                      isFocusedMain
                        ? 'bg-blue-700 text-blue-100 font-bold'
                        : 'bg-slate-200/80 text-slate-600 font-semibold'
                    }`}
                  >
                    {table.columns.length} col
                  </span>

                  {onSelectTable && table.name !== focusedTableName && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTable(table.name);
                      }}
                      className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-blue-600 transition-colors"
                      title="Abrir aba desta tabela"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Lista de Colunas Compacta & Limpa */}
              <div className="p-1.5 space-y-0.5 font-mono text-[10px] bg-white">
                {displayedColumns.map((col: DatabaseColumn) => (
                  <div
                    key={col.name}
                    className={`flex items-center justify-between px-1.5 py-0.5 rounded transition-colors ${
                      col.isPrimaryKey
                        ? 'bg-amber-50 text-amber-800 font-bold border border-amber-200/60'
                        : col.isForeignKey
                        ? 'bg-blue-50 text-blue-800 font-semibold border border-blue-200/60'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate pr-1">
                      {col.isPrimaryKey ? (
                        <span title="Chave Primária (PK)">
                          <Key className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                        </span>
                      ) : col.isForeignKey ? (
                        <span title="Chave Estrangeira (FK)">
                          <LinkIcon className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                        </span>
                      ) : (
                        <span className="w-2.5 h-2.5 shrink-0" />
                      )}
                      <span className="truncate">{col.name}</span>
                    </div>

                    <span className="text-[9px] text-slate-400 uppercase shrink-0 font-sans">
                      {col.type.split('(')[0]}
                    </span>
                  </div>
                ))}

                {/* Botão de Expandir / Recolher Colunas Adicionais */}
                {hiddenCount > 0 && !isExpanded && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTableExpand(table.name);
                    }}
                    className="w-full text-center py-0.5 text-[9px] text-blue-600 hover:underline font-sans flex items-center justify-center gap-1"
                  >
                    <span>+ {hiddenCount} colunas</span>
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                )}

                {isExpanded && otherColumns.length > 3 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTableExpand(table.name);
                    }}
                    className="w-full text-center py-0.5 text-[9px] text-slate-500 hover:underline font-sans flex items-center justify-center gap-1"
                  >
                    <span>Recolher</span>
                    <ChevronUp className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};