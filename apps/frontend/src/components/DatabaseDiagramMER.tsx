import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  const [zoom, setZoom] = useState(0.95);
  const [positions, setPositions] = useState<Record<string, TablePosition>>({});
  const [selectedTable, setSelectedTable] = useState<string | null>(focusedTableName || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewScope, setViewScope] = useState<'focused' | 'all'>(focusedTableName ? 'focused' : 'all');
  const [draggingTable, setDraggingTable] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Calcula tabelas relacionadas à tabela em foco
  const { relatedTableNames, incomingCount, outgoingCount } = useMemo(() => {
    if (!focusedTableName) {
      return { relatedTableNames: new Set<string>(), incomingCount: 0, outgoingCount: 0 };
    }

    const currentTbl = tables.find((t) => t.name === focusedTableName);
    const outgoing = new Set<string>((currentTbl?.foreignKeys || []).map((fk) => fk.referencedTable));

    const incoming = new Set<string>();
    tables.forEach((t) => {
      if (t.name !== focusedTableName) {
        if (t.foreignKeys.some((fk) => fk.referencedTable === focusedTableName)) {
          incoming.add(t.name);
        }
      }
    });

    const allRelated = new Set<string>([focusedTableName, ...Array.from(outgoing), ...Array.from(incoming)]);

    return {
      relatedTableNames: allRelated,
      incomingCount: incoming.size,
      outgoingCount: outgoing.size,
    };
  }, [tables, focusedTableName]);

  // Lista de tabelas ativas a exibir de acordo com o escopo
  const activeTables = useMemo(() => {
    if (viewScope === 'focused' && focusedTableName) {
      return tables.filter((t) => relatedTableNames.has(t.name));
    }
    return tables;
  }, [tables, viewScope, focusedTableName, relatedTableNames]);

  // Inicializa posições das tabelas
  useEffect(() => {
    const initialPos: Record<string, TablePosition> = {};

    if (viewScope === 'focused' && focusedTableName) {
      // Posicionamento estelar focado:
      // Tabela foco no centro, tabelas de entrada (dependentes) na esquerda, tabelas de saída (pais) na direita
      const currentTbl = tables.find((t) => t.name === focusedTableName);
      const outgoingNames = (currentTbl?.foreignKeys || []).map((fk) => fk.referencedTable);
      const incomingNames = tables
        .filter((t) => t.name !== focusedTableName && t.foreignKeys.some((fk) => fk.referencedTable === focusedTableName))
        .map((t) => t.name);

      // Centro
      initialPos[focusedTableName] = { x: 420, y: 180 };

      // Esquerda: Tabelas que apontam para esta tabela (Incoming)
      incomingNames.forEach((name, idx) => {
        initialPos[name] = { x: 40, y: 40 + idx * 240 };
      });

      // Direita: Tabelas que esta tabela referencia (Outgoing)
      outgoingNames.forEach((name, idx) => {
        initialPos[name] = { x: 820, y: 40 + idx * 240 };
      });

      setPositions(initialPos);
    } else {
      // Layout em grid padrão para visualização completa
      const cols = Math.max(2, Math.ceil(Math.sqrt(tables.length)));
      const colWidth = 320;
      const rowHeight = 280;

      tables.forEach((table, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        initialPos[table.name] = {
          x: 40 + col * (colWidth + 60),
          y: 40 + row * (rowHeight + 40),
        };
      });

      setPositions(initialPos);
    }
  }, [tables, viewScope, focusedTableName]);

  // Arrastar tabelas
  const handleMouseDown = (tableName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingTable(tableName);
    const pos = positions[tableName] || { x: 0, y: 0 };
    setDragOffset({
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingTable) {
      setPositions((prev) => ({
        ...prev,
        [draggingTable]: {
          x: Math.max(10, e.clientX - dragOffset.x),
          y: Math.max(10, e.clientY - dragOffset.y),
        },
      }));
    }
  };

  const handleMouseUp = () => {
    setDraggingTable(null);
  };

  const filteredTables = activeTables.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      className="relative w-full h-[620px] bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden select-none shadow-xs"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      ref={containerRef}
    >
      {/* Background Grid Pattern (Pontilhado sutil estilo Miro / Figma) */}
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(#94a3b8 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      {/* Top Floating Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
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

          {!focusedTableName && (
            <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
              {tables.length} tabelas
            </span>
          )}
        </div>

        {/* Busca e Zoom */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Localizar tabela..."
              className="pl-8 pr-3 py-1.5 text-xs bg-white text-slate-800 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono w-44 shadow-sm"
            />
          </div>

          <div className="flex items-center bg-white rounded-xl border border-slate-200 p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="px-2 text-[11px] font-mono font-bold text-slate-600">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
              title="Diminuir Zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(0.95)}
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
              title="Restaurar Zoom 100%"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* SVG Canvas de Conexões de Chaves Estrangeiras */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
      >
        <defs>
          <marker
            id="mer-arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb" />
          </marker>
        </defs>

        {activeTables.map((table) => {
          const fromPos = positions[table.name];
          if (!fromPos) return null;

          return table.foreignKeys.map((fk: DatabaseForeignKey, fkIdx: number) => {
            const toPos = positions[fk.referencedTable];
            if (!toPos) return null;

            const startX = fromPos.x + 290;
            const startY = fromPos.y + 55 + fkIdx * 20;
            const endX = toPos.x;
            const endY = toPos.y + 45;

            const midX = (startX + endX) / 2;

            const isRelatedToFocus =
              focusedTableName && (table.name === focusedTableName || fk.referencedTable === focusedTableName);

            return (
              <g key={`${table.name}-${fk.column}-${fk.referencedTable}`}>
                <path
                  d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                  fill="none"
                  stroke={isRelatedToFocus ? '#2563eb' : '#64748b'}
                  strokeWidth={isRelatedToFocus ? '2.5' : '1.5'}
                  strokeDasharray={isRelatedToFocus ? undefined : '4 3'}
                  markerEnd="url(#mer-arrowhead)"
                  opacity={
                    selectedTable && selectedTable !== table.name && selectedTable !== fk.referencedTable ? 0.25 : 0.9
                  }
                />
              </g>
            );
          });
        })}
      </svg>

      {/* Cards Arrastáveis de Cada Tabela */}
      <div
        className="absolute inset-0 w-[4000px] h-[4000px]"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
      >
        {filteredTables.map((table) => {
          const pos = positions[table.name] || { x: 40, y: 40 };
          const isFocusedMain = focusedTableName === table.name;
          const isSelected = selectedTable === table.name || isFocusedMain;

          return (
            <div
              key={table.name}
              onMouseDown={(e) => handleMouseDown(table.name, e)}
              onClick={() => setSelectedTable(table.name)}
              onDoubleClick={() => onSelectTable?.(table.name)}
              style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                width: '290px',
              }}
              className={`absolute bg-white rounded-2xl shadow-md transition-shadow cursor-grab active:cursor-grabbing overflow-hidden z-10 border ${
                isFocusedMain
                  ? 'border-blue-600 ring-4 ring-blue-500/20 shadow-xl'
                  : isSelected
                  ? 'border-blue-500 ring-2 ring-blue-500/30'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Header do Card da Tabela */}
              <div
                className={`px-3.5 py-2.5 border-b flex items-center justify-between ${
                  isFocusedMain
                    ? 'bg-blue-600 text-white border-blue-700'
                    : 'bg-slate-50 text-slate-800 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isFocusedMain ? 'bg-amber-300 animate-pulse' : 'bg-blue-500'
                    }`}
                  />
                  <span className="font-bold text-xs font-mono truncate">{table.name}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
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

              {/* Lista de Colunas */}
              <div className="p-2 space-y-1 max-h-56 overflow-y-auto font-mono text-[11px] bg-white">
                {table.columns.map((col: DatabaseColumn) => (
                  <div
                    key={col.name}
                    className={`flex items-center justify-between px-2 py-1 rounded-lg transition-colors ${
                      col.isPrimaryKey
                        ? 'bg-amber-50 text-amber-800 font-bold border border-amber-200/60'
                        : col.isForeignKey
                        ? 'bg-blue-50 text-blue-800 font-semibold border border-blue-200/60'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate pr-2">
                      {col.isPrimaryKey ? (
                        <span title="Chave Primária (PK)">
                          <Key className="w-3 h-3 text-amber-600 shrink-0" />
                        </span>
                      ) : col.isForeignKey ? (
                        <span title="Chave Estrangeira (FK)">
                          <LinkIcon className="w-3 h-3 text-blue-600 shrink-0" />
                        </span>
                      ) : (
                        <span className="w-3 h-3 shrink-0" />
                      )}
                      <span className="truncate">{col.name}</span>
                    </div>

                    <span className="text-[10px] text-slate-400 uppercase shrink-0 font-sans">
                      {col.type.split('(')[0]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};