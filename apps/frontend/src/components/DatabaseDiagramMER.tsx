import React, { useState, useRef, useEffect } from 'react';
import {
  Key,
  Link as LinkIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  Search,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { DatabaseTable, DatabaseForeignKey, DatabaseColumn } from '../types/index.ts';

interface DatabaseDiagramMERProps {
  tables: DatabaseTable[];
  databaseName: string;
}

interface TablePosition {
  x: number;
  y: number;
}

export const DatabaseDiagramMER: React.FC<DatabaseDiagramMERProps> = ({ tables, databaseName }) => {
  const [zoom, setZoom] = useState(1);
  const [positions, setPositions] = useState<Record<string, TablePosition>>({});
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [draggingTable, setDraggingTable] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Inicializa posições das tabelas em grid agradável
  useEffect(() => {
    const initialPos: Record<string, TablePosition> = {};
    const cols = Math.max(2, Math.ceil(Math.sqrt(tables.length)));
    const colWidth = 320;
    const rowHeight = 300;

    tables.forEach((table, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      initialPos[table.name] = {
        x: 40 + col * (colWidth + 60),
        y: 40 + row * (rowHeight + 40),
      };
    });

    setPositions(initialPos);
  }, [tables]);

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

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      className="relative w-full h-[650px] bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      ref={containerRef}
    >
      {/* Background Grid Pattern */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(#38bdf8 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      {/* Top Floating Toolbar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-700/80 shadow-xl pointer-events-auto">
          <Layers className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-bold text-slate-100">Diagrama MER: {databaseName}</span>
          <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full">
            {tables.length} tabelas
          </span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Localizar tabela..."
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-900/90 text-slate-200 border border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono w-48 shadow-lg"
            />
          </div>

          <div className="flex items-center bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700 p-1 shadow-lg">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="px-2 text-[11px] font-mono text-slate-400">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
              title="Diminuir Zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
              title="Restaurar Zoom 100%"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* SVG Canvas for Foreign Key Relationship Lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#60a5fa" />
          </marker>
        </defs>

        {tables.map((table) => {
          const fromPos = positions[table.name];
          if (!fromPos) return null;

          return table.foreignKeys.map((fk: DatabaseForeignKey, fkIdx: number) => {
            const toPos = positions[fk.referencedTable];
            if (!toPos) return null;

            // Coordenadas centrais aproximadas das caixas
            const startX = fromPos.x + 300;
            const startY = fromPos.y + 60 + fkIdx * 24;
            const endX = toPos.x;
            const endY = toPos.y + 50;

            const midX = (startX + endX) / 2;

            return (
              <g key={`${table.name}-${fk.column}-${fk.referencedTable}`}>
                <path
                  d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                  markerEnd="url(#arrowhead)"
                  opacity={selectedTable && selectedTable !== table.name && selectedTable !== fk.referencedTable ? 0.2 : 0.8}
                />
              </g>
            );
          });
        })}
      </svg>

      {/* Interactive Draggable Table Cards */}
      <div
        className="absolute inset-0 w-[4000px] h-[4000px]"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
      >
        {filteredTables.map((table) => {
          const pos = positions[table.name] || { x: 40, y: 40 };
          const isSelected = selectedTable === table.name;

          return (
            <div
              key={table.name}
              onMouseDown={(e) => handleMouseDown(table.name, e)}
              onClick={() => setSelectedTable(table.name)}
              style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                width: '300px',
              }}
              className={`absolute bg-slate-900 border rounded-2xl shadow-2xl transition-shadow cursor-grab active:cursor-grabbing overflow-hidden z-10 ${
                isSelected
                  ? 'border-blue-500 ring-2 ring-blue-500/40'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Table Card Header */}
              <div className="px-4 py-2.5 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                  <span className="font-bold text-slate-100 text-xs font-mono truncate">{table.name}</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  {table.columns.length} cols
                </span>
              </div>

              {/* Table Columns List */}
              <div className="p-2 space-y-1 max-h-64 overflow-y-auto font-mono text-[11px]">
                {table.columns.map((col: DatabaseColumn) => (
                  <div
                    key={col.name}
                    className={`flex items-center justify-between px-2 py-1 rounded-lg transition-colors ${
                      col.isPrimaryKey ? 'bg-amber-500/10 text-amber-300 font-semibold' : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate pr-2">
                      {col.isPrimaryKey ? (
                        <span title="Chave Primária (PK)">
                          <Key className="w-3 h-3 text-amber-400 shrink-0" />
                        </span>
                      ) : col.isForeignKey ? (
                        <span title="Chave Estrangeira (FK)">
                          <LinkIcon className="w-3 h-3 text-blue-400 shrink-0" />
                        </span>
                      ) : (
                        <span className="w-3 h-3 shrink-0" />
                      )}
                      <span className="truncate">{col.name}</span>
                    </div>

                    <span className="text-[10px] text-slate-500 uppercase shrink-0">
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
