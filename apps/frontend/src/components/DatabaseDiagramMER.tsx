import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Key,
  Link as LinkIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
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

interface DiagramRelation {
  key: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  isInferred?: boolean;
}

const CARD_WIDTH = 250;
const HEADER_HEIGHT = 33;
const CONTAINER_PAD_TOP = 6;
const ROW_HEIGHT = 20;

/** Retorna as colunas visíveis em um card (máximo 5 se minimizado, todas se expandido) */
function getDisplayedColumns(table: DatabaseTable, isExpanded: boolean): DatabaseColumn[] {
  if (isExpanded) {
    return table.columns;
  }
  const prioritized = [
    ...table.columns.filter((c) => c.isPrimaryKey),
    ...table.columns.filter((c) => !c.isPrimaryKey && c.isForeignKey),
    ...table.columns.filter((c) => !c.isPrimaryKey && !c.isForeignKey),
  ];
  return prioritized.slice(0, 5);
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
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewScope, setViewScope] = useState<'focused' | 'all'>(focusedTableName ? 'focused' : 'all');

  // Dragging individual tables vs dragging canvas background
  const [draggingTable, setDraggingTable] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanningCanvas, setIsPanningCanvas] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Expansão de colunas por tabela: true = maximizada (todos os campos), false = minimizada (máximo 5 campos)
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  const containerRef = useRef<HTMLDivElement>(null);

  // Mapeia todas as relações (formais FKs + relacionamentos convencionais inferidos)
  const allRelations = useMemo(() => {
    const tableMap = new Map<string, DatabaseTable>();
    tables.forEach((t) => tableMap.set(t.name.toLowerCase(), t));

    const rels: DiagramRelation[] = [];
    const relKeys = new Set<string>();

    tables.forEach((tbl) => {
      // 1. Chaves estrangeiras formais do banco de dados
      (tbl.foreignKeys || []).forEach((fk) => {
        const targetTable = tableMap.get(fk.referencedTable.toLowerCase());
        const targetName = targetTable ? targetTable.name : fk.referencedTable;
        const key = `${tbl.name}.${fk.column}->${targetName}.${fk.referencedColumn || 'id'}`;

        if (!relKeys.has(key)) {
          relKeys.add(key);
          rels.push({
            key,
            fromTable: tbl.name,
            fromColumn: fk.column,
            toTable: targetName,
            toColumn: fk.referencedColumn || 'id',
            isInferred: false,
          });
        }
      });

      // 2. Detecção inteligente de relações inferidas (por convenção userId, user_id, etc.)
      (tbl.columns || []).forEach((col) => {
        if (col.isPrimaryKey) return;

        const colLower = col.name.toLowerCase();
        let candidateName = '';

        if (colLower.endsWith('_id')) {
          candidateName = colLower.slice(0, -3);
        } else if (colLower.endsWith('id') && colLower.length > 2) {
          candidateName = colLower.slice(0, -2);
        }

        if (candidateName) {
          const targetTable =
            tableMap.get(candidateName) ||
            tableMap.get(`${candidateName}s`) ||
            tableMap.get(`${candidateName}es`);

          if (targetTable && targetTable.name !== tbl.name) {
            const targetCol = targetTable.primaryKeys[0] || 'id';
            const key = `${tbl.name}.${col.name}->${targetTable.name}.${targetCol}`;

            if (!relKeys.has(key)) {
              relKeys.add(key);
              rels.push({
                key,
                fromTable: tbl.name,
                fromColumn: col.name,
                toTable: targetTable.name,
                toColumn: targetCol,
                isInferred: true,
              });
            }
          }
        }
      });
    });

    return rels;
  }, [tables]);

  // Calcula tabelas relacionadas à tabela em foco
  const { relatedTableNames, incomingTables, outgoingTables } = useMemo(() => {
    if (!focusedTableName) {
      return {
        relatedTableNames: new Set<string>(),
        incomingTables: [] as DatabaseTable[],
        outgoingTables: [] as DatabaseTable[],
      };
    }

    const focusedLower = focusedTableName.toLowerCase();
    const outgoingTargetNames = new Set<string>();
    const incomingSourceNames = new Set<string>();

    allRelations.forEach((rel) => {
      if (rel.fromTable.toLowerCase() === focusedLower && rel.toTable.toLowerCase() !== focusedLower) {
        outgoingTargetNames.add(rel.toTable);
      }
      if (rel.toTable.toLowerCase() === focusedLower && rel.fromTable.toLowerCase() !== focusedLower) {
        incomingSourceNames.add(rel.fromTable);
      }
    });

    const outgoing = tables.filter((t) => outgoingTargetNames.has(t.name));
    const incoming = tables.filter((t) => incomingSourceNames.has(t.name));

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
  }, [tables, focusedTableName, allRelations]);

  // Lista de tabelas ativas a exibir
  const activeTables = useMemo(() => {
    if (viewScope === 'focused' && focusedTableName) {
      return tables.filter((t) => relatedTableNames.has(t.name));
    }
    return tables;
  }, [tables, viewScope, focusedTableName, relatedTableNames]);

  // Relações ativas a desenhar no diagrama
  const activeRelations = useMemo(() => {
    const activeNames = new Set(activeTables.map((t) => t.name));
    return allRelations.filter(
      (rel) => activeNames.has(rel.fromTable) && activeNames.has(rel.toTable)
    );
  }, [allRelations, activeTables]);

  // Algoritmo de Auto-Layout Limpo e Organizado
  const calculateAutoLayout = useCallback(() => {
    const newPos: Record<string, TablePosition> = {};

    if (viewScope === 'focused' && focusedTableName) {
      // 1. MODO FOCADO (DISTRIBUIÇÃO SIMÉTRICA E BALANCEADA AO REDOR DO FOCO)
      const otherTables = activeTables.filter((t) => t.name !== focusedTableName);
      const totalOthers = otherTables.length;

      let leftList: DatabaseTable[] = [];
      let rightList: DatabaseTable[] = [];

      if (outgoingTables.length > 0 && incomingTables.length > 0) {
        leftList = incomingTables;
        rightList = outgoingTables;
      } else {
        // Se as relações estão quase todas de um lado (ex: User tem 14 tabelas dependentes e 0 pais)
        // Divide simetricamente entre a esquerda e a direita para equilibrar a tela e evitar tabelas fora da visão
        const half = Math.ceil(totalOthers / 2);
        leftList = otherTables.slice(0, half);
        rightList = otherTables.slice(half);
      }

      const leftCols = leftList.length > 3 ? 2 : 1;
      const rightCols = rightList.length > 3 ? 2 : 1;

      const centerX = leftCols === 2 ? 620 : 360;
      const centerY = 160;
      newPos[focusedTableName] = { x: centerX, y: centerY };

      // Distribui tabelas à esquerda
      const leftPerCol = Math.ceil(leftList.length / leftCols);
      leftList.forEach((tbl, idx) => {
        const colIdx = Math.floor(idx / leftPerCol);
        const rowIdx = idx % leftPerCol;
        const x = colIdx === 0 ? 40 : 310;
        const y = 40 + rowIdx * 210;
        newPos[tbl.name] = { x, y };
      });

      // Distribui tabelas à direita
      const rightPerCol = Math.ceil(rightList.length / rightCols);
      rightList.forEach((tbl, idx) => {
        const colIdx = Math.floor(idx / rightPerCol);
        const rowIdx = idx % rightPerCol;
        const x = centerX + CARD_WIDTH + 80 + colIdx * (CARD_WIDTH + 30);
        const y = 40 + rowIdx * 210;
        newPos[tbl.name] = { x, y };
      });

      setPositions(newPos);

      // Calcula dimensões reais para ajuste automático de enquadramento
      const allX = Object.values(newPos).map((p) => p.x);
      const allY = Object.values(newPos).map((p) => p.y);
      const maxX = Math.max(...allX) + CARD_WIDTH + 60;
      const maxY = Math.max(...allY) + 240;

      const fitZoom = Math.min(0.85, Math.max(0.55, 1200 / maxX, 650 / maxY));
      setZoom(fitZoom);
      setPan({ x: 20, y: 20 });
    } else {
      // 2. MODO GERAL: Grid Espaçado e Limpo
      const cols = Math.max(3, Math.ceil(Math.sqrt(tables.length * 1.5)));
      const colWidth = CARD_WIDTH;
      const rowHeight = 240;

      tables.forEach((table, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        newPos[table.name] = {
          x: 40 + col * (colWidth + 80),
          y: 40 + row * (rowHeight + 60),
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

  // Alternar minimização de tabela individual
  const toggleTableExpand = (tableName: string) => {
    setExpandedTables((prev) => ({
      ...prev,
      [tableName]: !prev[tableName],
    }));
  };

  // Expandir todas para exibir todos os campos
  const expandAllTables = () => {
    const all: Record<string, boolean> = {};
    activeTables.forEach((t) => (all[t.name] = true));
    setExpandedTables(all);
  };

  // Minimizar todas para o limite de 5 campos
  const collapseAllTables = () => {
    setExpandedTables({});
  };

  const areAllExpanded =
    activeTables.length > 0 && activeTables.every((t) => !!expandedTables[t.name]);

  const filteredTables = activeTables.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      className={`relative w-full h-[calc(100vh-14rem)] min-h-[640px] bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden select-none shadow-xs ${
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

        {/* Controles de Zoom, Auto-Layout, Minimizar/Maximizar e Busca */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Botão Global de Minimizar / Maximizar Todas as Tabelas */}
          <button
            type="button"
            onClick={areAllExpanded ? collapseAllTables : expandAllTables}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold shadow-sm transition-all"
            title={areAllExpanded ? 'Minimizar todas para 5 campos' : 'Maximizar todas (mostrar todos os campos)'}
          >
            {areAllExpanded ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Minimizar Todas (5 campos)</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Maximizar Todas</span>
              </>
            )}
          </button>

          {/* Botão Organizar / Auto-Layout */}
          <button
            type="button"
            onClick={calculateAutoLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold shadow-sm transition-all"
            title="Reorganizar automaticamente as tabelas em layout limpo"
          >
            <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
            <span>Reorganizar</span>
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

      {/* SVG Canvas de Conexões de Relações Ancoradas nos Campos */}
      <svg
        className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none z-10 overflow-visible"
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
            id="mer-arrowhead-standard"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
          </marker>
        </defs>

        {activeRelations.map((rel) => {
          const fromPos = positions[rel.fromTable];
          const toPos = positions[rel.toTable];
          if (!fromPos || !toPos) return null;

          const fromTable = tables.find((t) => t.name === rel.fromTable);
          const toTable = tables.find((t) => t.name === rel.toTable);
          if (!fromTable || !toTable) return null;

          const isFromExpanded = !!expandedTables[rel.fromTable];
          const isToExpanded = !!expandedTables[rel.toTable];

          // Descobre as colunas exibidas em cada tabela
          const fromDisplayed = getDisplayedColumns(fromTable, isFromExpanded);
          const toDisplayed = getDisplayedColumns(toTable, isToExpanded);

          // Posição vertical exata da coluna no card
          const fromRowIdx = fromDisplayed.findIndex((c) => c.name === rel.fromColumn);
          const toRowIdx = toDisplayed.findIndex((c) => c.name === rel.toColumn);

          // Coordenada Y precisa ancorada no campo exato
          const startY =
            fromRowIdx >= 0
              ? fromPos.y + 48 + fromRowIdx * ROW_HEIGHT
              : fromPos.y + 48 + fromDisplayed.length * ROW_HEIGHT + 8;

          const endY =
            toRowIdx >= 0
              ? toPos.y + 48 + toRowIdx * ROW_HEIGHT
              : toPos.y + 48 + toDisplayed.length * ROW_HEIGHT + 8;

          // Determina a direção horizontal da linha
          const isSameColumn = Math.abs(fromPos.x - toPos.x) < 80;
          let startX = 0;
          let endX = 0;
          let pathD = '';

          if (isSameColumn) {
            // Tabelas empilhadas verticalmente: contorna suavemente pela direita do card
            startX = fromPos.x + CARD_WIDTH;
            endX = toPos.x + CARD_WIDTH;
            const loopOffset = 45;
            const cp1X = startX + loopOffset;
            const cp2X = endX + loopOffset;
            pathD = `M ${startX} ${startY} C ${cp1X} ${startY}, ${cp2X} ${endY}, ${endX} ${endY}`;
          } else {
            const fromLeft = fromPos.x > toPos.x;
            startX = fromLeft ? fromPos.x : fromPos.x + CARD_WIDTH;
            endX = fromLeft ? toPos.x + CARD_WIDTH : toPos.x;

            const deltaX = Math.abs(endX - startX);
            const curvature = Math.max(50, deltaX * 0.45);
            const cp1X = fromLeft ? startX - curvature : startX + curvature;
            const cp2X = fromLeft ? endX + curvature : endX - curvature;
            pathD = `M ${startX} ${startY} C ${cp1X} ${startY}, ${cp2X} ${endY}, ${endX} ${endY}`;
          }

          // Destaque de relações
          const isRelatedToFocus =
            focusedTableName &&
            (rel.fromTable.toLowerCase() === focusedTableName.toLowerCase() ||
              rel.toTable.toLowerCase() === focusedTableName.toLowerCase());

          const isRelatedToSelected =
            selectedTable &&
            (rel.fromTable === selectedTable || rel.toTable === selectedTable);

          const isHovered =
            hoveredLine === rel.key ||
            hoveredColumn === `${rel.fromTable}.${rel.fromColumn}` ||
            hoveredColumn === `${rel.toTable}.${rel.toColumn}`;

          const strokeColor = isHovered
            ? '#1d4ed8'
            : isRelatedToFocus || isRelatedToSelected
            ? '#2563eb'
            : '#64748b';

          const strokeWidth = isHovered ? 3.5 : isRelatedToFocus || isRelatedToSelected ? 2.5 : 1.8;
          const strokeOpacity = isHovered ? 1 : isRelatedToFocus || isRelatedToSelected ? 0.95 : 0.7;

          return (
            <g key={rel.key}>
              {/* Linha de conexão conectando campo a campo */}
              <path
                d={pathD}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={rel.isInferred ? '5 4' : undefined}
                markerEnd={
                  isRelatedToFocus || isRelatedToSelected || isHovered
                    ? 'url(#mer-arrowhead-active)'
                    : 'url(#mer-arrowhead-standard)'
                }
                opacity={strokeOpacity}
                className="transition-all pointer-events-auto cursor-pointer"
                onMouseEnter={() => setHoveredLine(rel.key)}
                onMouseLeave={() => setHoveredLine(null)}
              />

              {/* Ponto de ancoragem no campo de origem */}
              <circle
                cx={startX}
                cy={startY}
                r={isHovered ? 4.5 : 3.5}
                fill={strokeColor}
                opacity={strokeOpacity}
              >
                <title>{`${rel.fromTable}.${rel.fromColumn}`}</title>
              </circle>

              {/* Ponto de ancoragem no campo de destino */}
              <circle
                cx={endX}
                cy={endY}
                r={isHovered ? 4.5 : 3.5}
                fill={strokeColor}
                opacity={strokeOpacity}
              >
                <title>{`${rel.toTable}.${rel.toColumn}`}</title>
              </circle>
            </g>
          );
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

          // REGRA DOS 5 CAMPOS: quando minimizada exibe no máximo 5 campos; quando maximizada exibe todos
          const displayedColumns = getDisplayedColumns(table, isExpanded);
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
                width: `${CARD_WIDTH}px`,
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

                  {/* Botão de Minimizar / Maximizar no Header */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTableExpand(table.name);
                    }}
                    className={`p-1 rounded transition-colors ${
                      isFocusedMain
                        ? 'hover:bg-blue-700 text-blue-100 hover:text-white'
                        : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
                    }`}
                    title={isExpanded ? 'Minimizar para 5 campos' : 'Maximizar para ver todos os campos'}
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {onSelectTable && table.name !== focusedTableName && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTable(table.name);
                      }}
                      className={`p-1 rounded transition-colors ${
                        isFocusedMain
                          ? 'hover:bg-blue-700 text-blue-100'
                          : 'hover:bg-slate-200 text-slate-500 hover:text-blue-600'
                      }`}
                      title="Abrir aba desta tabela"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Lista de Colunas: no máximo 5 quando minimizada, ou todas com scroll quando maximizada */}
              <div
                className={`p-1.5 space-y-0.5 font-mono text-[10px] bg-white ${
                  isExpanded ? 'max-h-80 overflow-y-auto' : ''
                }`}
              >
                {displayedColumns.map((col: DatabaseColumn) => {
                  const colKey = `${table.name}.${col.name}`;
                  const isColHovered =
                    hoveredColumn === colKey ||
                    hoveredLine?.includes(colKey);

                  return (
                    <div
                      key={col.name}
                      onMouseEnter={() => setHoveredColumn(colKey)}
                      onMouseLeave={() => setHoveredColumn(null)}
                      className={`flex items-center justify-between px-1.5 py-0.5 rounded transition-colors ${
                        isColHovered
                          ? 'bg-blue-100 text-blue-900 font-bold'
                          : col.isPrimaryKey
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
                        {col.type?.split('(')[0]}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Rodapé: Botão de Expandir / Recolher Campos */}
              {hiddenCount > 0 && !isExpanded && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTableExpand(table.name);
                  }}
                  className="w-full text-center py-1 text-[10px] text-blue-600 hover:bg-blue-50/70 font-semibold flex items-center justify-center gap-1 border-t border-slate-100 transition-colors"
                >
                  <span>+ {hiddenCount} campos ocultos (Maximizar)</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              )}

              {isExpanded && table.columns.length > 5 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTableExpand(table.name);
                  }}
                  className="w-full text-center py-1 text-[10px] text-slate-500 hover:bg-slate-50 font-medium flex items-center justify-center gap-1 border-t border-slate-100 transition-colors"
                >
                  <span>Minimizar (mostrar 5 campos)</span>
                  <ChevronUp className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
