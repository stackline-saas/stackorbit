import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database,
  Plus,
  Zap,
  Layers,
  RefreshCw,
  Search,
  ExternalLink,
  Table as TableIcon,
  Play,
  Square,
  Settings,
  Copy,
  Check,
  Server,
  Terminal,
} from 'lucide-react';
import type { Service, Project } from '../../types/index.ts';
import { TemplateDeployModal } from '../TemplateDeployModal.tsx';

interface DatabasesViewProps {
  selectedProjectId?: string | null;
  projects?: Project[];
  mainDomain?: string;
}

export const DatabasesView: React.FC<DatabasesViewProps> = ({
  selectedProjectId,
  projects = [],
  mainDomain = 'bla.com.br',
}) => {
  const navigate = useNavigate();
  const [databases, setDatabases] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadDatabases = async () => {
    setIsLoading(true);
    try {
      const url = selectedProjectId
        ? `/api/databases?projectId=${encodeURIComponent(selectedProjectId)}`
        : '/api/databases';

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}` },
      });

      if (res.ok) {
        const data = await res.json();
        setDatabases(data || []);
      }
    } catch (err) {
      console.error('Erro ao carregar bancos de dados:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDatabases();
  }, [selectedProjectId]);

  const copyConnectionString = (db: Service) => {
    const img = (db.image || '').toLowerCase();
    let conn = '';
    if (img.includes('postgres')) {
      conn = `postgresql://postgres:senha@${db.containerName}:${db.internalPort || 5432}/app_database`;
    } else if (img.includes('mariadb') || img.includes('mysql')) {
      conn = `mysql://root:senha@${db.containerName}:${db.internalPort || 3306}/app_database`;
    } else if (img.includes('redis')) {
      conn = `redis://${db.containerName}:${db.internalPort || 6379}`;
    }

    navigator.clipboard.writeText(conn);
    setCopiedId(db.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getDbBadge = (db: Service) => {
    const img = (db.image || '').toLowerCase();
    const notes = (db.notes || '').toLowerCase();

    if (img.includes('postgres') || notes.includes('postgres')) {
      return {
        label: 'PostgreSQL 16',
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        isRedis: false,
      };
    }
    if (img.includes('mariadb') || notes.includes('mariadb')) {
      return {
        label: 'MariaDB 11',
        color: 'bg-amber-50 text-amber-700 border-amber-200',
        isRedis: false,
      };
    }
    if (img.includes('mysql') || notes.includes('mysql')) {
      return {
        label: 'MySQL 8',
        color: 'bg-orange-50 text-orange-700 border-orange-200',
        isRedis: false,
      };
    }
    if (img.includes('redis') || notes.includes('redis')) {
      return {
        label: 'Redis 7 Alpine',
        color: 'bg-red-50 text-red-700 border-red-200',
        isRedis: true,
      };
    }
    return {
      label: 'Banco de Dados',
      color: 'bg-slate-50 text-slate-700 border-slate-200',
      isRedis: false,
    };
  };

  const filteredDatabases = databases.filter((db) => {
    const matchSearch =
      db.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      db.containerName.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchSearch) return false;
    if (filterType === 'all') return true;

    const img = (db.image || '').toLowerCase();
    if (filterType === 'sql') return img.includes('postgres') || img.includes('mariadb') || img.includes('mysql');
    if (filterType === 'redis') return img.includes('redis');

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-slate-900">Bancos de Dados</h1>
            <span className="px-2.5 py-0.5 text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/60 rounded-full">
              {databases.length} {databases.length === 1 ? 'instância' : 'instâncias'}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Gerencie instâncias de PostgreSQL, MariaDB, MySQL e Redis com Database Studio e Diagrama MER interativo.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadDatabases}
            disabled={isLoading}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs transition-all"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsDeployModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Banco de Dados</span>
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar banco ou container..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'sql', label: 'SQL (Postgres & MySQL)' },
            { id: 'redis', label: 'Cache (Redis)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
                filterType === tab.id
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Databases Grid */}
      {isLoading && databases.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-600" />
          <p className="font-semibold text-slate-700 text-sm">Carregando bancos de dados...</p>
        </div>
      ) : filteredDatabases.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-3xl border border-slate-200 shadow-2xs p-8">
          <Database className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <h3 className="font-bold text-slate-800 text-base mb-1">Nenhum banco de dados configurado</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-5 leading-relaxed">
            Suba uma instância do PostgreSQL 16, MariaDB 11 ou Redis 7 em segundos e use o Database Studio nativo para gerenciar tabelas e modelagem.
          </p>
          <button
            type="button"
            onClick={() => setIsDeployModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Banco de Dados</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDatabases.map((db) => {
            const badge = getDbBadge(db);
            const isRunning = db.status === 'running';

            return (
              <div
                key={db.id}
                className="bg-white rounded-3xl border border-slate-200/80 hover:border-slate-300 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
              >
                {/* Card Top */}
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-xl border ${badge.color}`}
                    >
                      {badge.isRedis ? <Zap className="w-3.5 h-3.5 text-red-500" /> : <Database className="w-3.5 h-3.5 text-blue-600" />}
                      <span>{badge.label}</span>
                    </span>

                    <span
                      className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      title={isRunning ? 'Executando' : 'Parado'}
                    />
                  </div>

                  <h3 className="font-bold text-slate-900 text-base mb-1 group-hover:text-blue-600 transition-colors truncate">
                    {db.name}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mb-4 truncate">{db.containerName}</p>

                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs font-mono text-slate-600">
                    <div className="flex items-center gap-2 truncate">
                      <Server className="w-3.5 h-3.5 text-slate-400" />
                      <span>Porta :{db.internalPort}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => copyConnectionString(db)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                      title="Copiar connection string"
                    >
                      {copiedId === db.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600 font-bold">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar URL</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Card Bottom: Studio Button */}
                <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/databases/${db.id}`)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                  >
                    {badge.isRedis ? (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        <span>Abrir Redis Studio</span>
                      </>
                    ) : (
                      <>
                        <Layers className="w-3.5 h-3.5" />
                        <span>Abrir Database Studio</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate(`/services/${db.id}`)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl transition-colors border border-transparent hover:border-slate-200"
                    title="Configurações do Serviço"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Deploy de Banco */}
      {isDeployModalOpen && (
        <TemplateDeployModal
          isOpen={isDeployModalOpen}
          onClose={() => setIsDeployModalOpen(false)}
          onDeploy={async (deployData) => {
            const res = await fetch('/api/templates/deploy', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem('dm_auth_token') || ''}`,
              },
              body: JSON.stringify({ ...deployData, projectId: selectedProjectId }),
            });
            if (res.ok) {
              loadDatabases();
              return true;
            }
            return false;
          }}
          mainDomain={mainDomain}
        />
      )}
    </div>
  );
};
