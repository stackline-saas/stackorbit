export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR';
  createdAt: string;
  updatedAt: string;
}

export interface Service {
  id: string;
  name: string;
  containerName: string;
  containerId?: string | null;
  image: string;
  internalPort: number;
  status: 'running' | 'stopped' | 'restarting' | 'error' | 'not_found';
  isActive: boolean;
  isDefault: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  domains?: Domain[];
  sourceType?: 'IMAGE' | 'GITHUB';
  gitRepoUrl?: string | null;
  gitBranch?: string | null;
  dockerfilePath?: string | null;
  envVars?: string | null;
  webhookSecret?: string | null;
  lastBuiltAt?: string | null;
  buildStatus?: 'idle' | 'cloning' | 'building' | 'success' | 'failed' | null;
  buildLogs?: string | null;
  restartPolicy?: 'always' | 'unless-stopped' | 'on-failure' | 'no' | null;
  memoryLimitMb?: number | null;
  cpuLimit?: number | null;
  command?: string | null;
  volumes?: string | null;
  network?: string | null;
}

export interface Domain {
  id: string;
  domainName: string;
  serviceId: string;
  isActive: boolean;
  service?: Service;
  sslStatus: 'cloudflare_proxied' | 'origin_ready' | 'pending';
  createdAt: string;
  updatedAt: string;
}

export interface ProxyConfiguration {
  id: string;
  version: number;
  contentYaml: string;
  appliedAt: string;
  appliedBy: string;
  status: 'applied' | 'generated' | 'failed';
  errorMessage?: string | null;
}

export interface AuditLog {
  id: string;
  userId?: string | null;
  userName: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  details: string;
  ipAddress?: string | null;
  createdAt: string;
}

export interface AppSettings {
  id: string;
  mainDomain: string;
  originServerIp: string;
  originHttpsPort: number;
  cloudflareSslMode: 'Full (strict)' | 'Full' | 'Flexible';
  dockerSocketPath: string;
  traefikDynamicConfigPath: string;
  autoApplyTraefik: boolean;
  defaultFallbackEnabled: boolean;
  updatedAt: string;
}

export interface DockerContainerInfo {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'stopped' | 'paused' | 'restarting';
  state: string;
  ports: Array<{
    ip?: string;
    privatePort: number;
    publicPort?: number;
    type: string;
  }>;
  created: number;
  command: string;
}

export interface DashboardStats {
  totalServices: number;
  activeServices: number;
  totalDomains: number;
  activeDomains: number;
  runningContainers: number;
  stoppedContainers: number;
  defaultServiceName: string | null;
  defaultServiceId: string | null;
  dockerConnected: boolean;
  dockerSocketPath: string;
  dockerEngineVersion?: string;
  dockerIsEmulated: boolean;
  recentAuditLogs: AuditLog[];
  lastProxyConfigAppliedAt?: string;
  mainDomain?: string;
}

export interface TemplateField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number';
  defaultValue: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
}

export interface ServiceTemplate {
  id: string;
  name: string;
  category: 'database' | 'cache_queue' | 'tools_web';
  categoryLabel: string;
  description: string;
  iconName: string;
  defaultImage: string;
  defaultPort: number;
  defaultContainerName: string;
  isWebUI: boolean;
  suggestedDomainPrefix?: string;
  fields: TemplateField[];
  generateEnv: (values: Record<string, string>) => string;
  generateCommand?: (values: Record<string, string>) => string;
  generateConnectionString?: (values: Record<string, string>, containerName: string) => string;
}

// ==========================================
// VALIDATION & REGEX HELPERS
// ==========================================
export const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
export const CONTAINER_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

export function validateDomain(domain: string): { valid: boolean; reason?: string } {
  if (!domain || typeof domain !== 'string') {
    return { valid: false, reason: 'O nome de domínio é obrigatório.' };
  }
  const clean = domain.trim().toLowerCase();
  if (clean.length > 253) {
    return { valid: false, reason: 'O domínio excede o limite máximo de 253 caracteres.' };
  }
  if (!DOMAIN_REGEX.test(clean)) {
    return { valid: false, reason: 'Formato de domínio inválido (ex: api.meusite.com ou portal.empresa.com.br).' };
  }
  return { valid: true };
}

// ==========================================
// TEMPLATES CATALOGUE
// ==========================================
export const SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    id: 'postgres',
    name: 'PostgreSQL 16',
    category: 'database',
    categoryLabel: 'Banco de Dados',
    description: 'Banco de dados relacional SQL robusto, transacional e de alto desempenho.',
    iconName: 'Database',
    defaultImage: 'postgres:16-alpine',
    defaultPort: 5432,
    defaultContainerName: 'postgres-srv',
    isWebUI: false,
    fields: [
      { key: 'POSTGRES_USER', label: 'Usuário do Banco', type: 'text', defaultValue: 'postgres', required: true },
      { key: 'POSTGRES_PASSWORD', label: 'Senha do Banco', type: 'password', defaultValue: 'Postgres2026!Sec', required: true },
      { key: 'POSTGRES_DB', label: 'Nome do Banco Inicial', type: 'text', defaultValue: 'app_production', required: true },
    ],
    generateEnv: (values) =>
      `POSTGRES_USER=${values.POSTGRES_USER || 'postgres'}\n` +
      `POSTGRES_PASSWORD=${values.POSTGRES_PASSWORD || 'Postgres2026!Sec'}\n` +
      `POSTGRES_DB=${values.POSTGRES_DB || 'app_production'}\n` +
      `PGDATA=/var/lib/postgresql/data/pgdata`,
    generateConnectionString: (values, containerName) =>
      `postgresql://${values.POSTGRES_USER || 'postgres'}:${encodeURIComponent(values.POSTGRES_PASSWORD || '')}@${containerName}:5432/${values.POSTGRES_DB || 'app_production'}`,
  },
  {
    id: 'mariadb',
    name: 'MariaDB 11 (MySQL)',
    category: 'database',
    categoryLabel: 'Banco de Dados',
    description: 'Substituto rápido e aberto do MySQL, compatível com WordPress e apps PHP/Node.',
    iconName: 'Database',
    defaultImage: 'mariadb:11',
    defaultPort: 3306,
    defaultContainerName: 'mariadb-srv',
    isWebUI: false,
    fields: [
      { key: 'MARIADB_USER', label: 'Usuário da Aplicação', type: 'text', defaultValue: 'app_user', required: true },
      { key: 'MARIADB_PASSWORD', label: 'Senha da Aplicação', type: 'password', defaultValue: 'MariaDB@2026Pass', required: true },
      { key: 'MARIADB_ROOT_PASSWORD', label: 'Senha do Root', type: 'password', defaultValue: 'RootRoot@2026!', required: true },
      { key: 'MARIADB_DATABASE', label: 'Nome do Banco', type: 'text', defaultValue: 'app_database', required: true },
    ],
    generateEnv: (values) =>
      `MARIADB_USER=${values.MARIADB_USER || 'app_user'}\n` +
      `MARIADB_PASSWORD=${values.MARIADB_PASSWORD || 'MariaDB@2026Pass'}\n` +
      `MARIADB_ROOT_PASSWORD=${values.MARIADB_ROOT_PASSWORD || 'RootRoot@2026!'}\n` +
      `MARIADB_DATABASE=${values.MARIADB_DATABASE || 'app_database'}`,
    generateConnectionString: (values, containerName) =>
      `mysql://${values.MARIADB_USER || 'app_user'}:${encodeURIComponent(values.MARIADB_PASSWORD || '')}@${containerName}:3306/${values.MARIADB_DATABASE || 'app_database'}`,
  },
  {
    id: 'redis',
    name: 'Redis 7 Alpine',
    category: 'cache_queue',
    categoryLabel: 'Cache & Filas',
    description: 'Armazenamento em memória ultra rápido para cache, sessões e filas BullMQ.',
    iconName: 'Layers',
    defaultImage: 'redis:7-alpine',
    defaultPort: 6379,
    defaultContainerName: 'redis-srv',
    isWebUI: false,
    fields: [
      { key: 'REDIS_PASSWORD', label: 'Senha do Redis (Recomendado)', type: 'password', defaultValue: 'Redis2026!Secret', required: false },
    ],
    generateEnv: (values) =>
      values.REDIS_PASSWORD ? `REDIS_PASSWORD=${values.REDIS_PASSWORD}` : '# Sem autenticação configurada',
    generateCommand: (values) =>
      values.REDIS_PASSWORD ? `redis-server --requirepass ${values.REDIS_PASSWORD}` : '',
    generateConnectionString: (values, containerName) =>
      values.REDIS_PASSWORD
        ? `redis://:${encodeURIComponent(values.REDIS_PASSWORD)}@${containerName}:6379`
        : `redis://${containerName}:6379`,
  },
  {
    id: 'adminer',
    name: 'Adminer Web Database GUI',
    category: 'tools_web',
    categoryLabel: 'Ferramentas Web',
    description: 'Interface web leve para gerenciar bancos PostgreSQL, MySQL, MariaDB e SQLite.',
    iconName: 'Globe',
    defaultImage: 'adminer:latest',
    defaultPort: 8080,
    defaultContainerName: 'adminer-ui',
    isWebUI: true,
    suggestedDomainPrefix: 'db',
    fields: [],
    generateEnv: () => '# Sem variáveis necessárias',
  },
  {
    id: 'hello-world',
    name: 'Hello World (Nginx Visual)',
    category: 'tools_web',
    categoryLabel: 'Ferramentas Web',
    description: 'Página web visual ultraleve e instantânea para testar e validar o roteamento de domínios no Traefik.',
    iconName: 'Globe',
    defaultImage: 'nginxdemos/hello:latest',
    defaultPort: 80,
    defaultContainerName: 'hello-world-web',
    isWebUI: true,
    suggestedDomainPrefix: 'hello',
    fields: [],
    generateEnv: () => '# Hello World Nginx Web',
  },
  {
    id: 'whoami',
    name: 'Traefik Whoami (Headers & IP)',
    category: 'tools_web',
    categoryLabel: 'Ferramentas Web',
    description: 'Serviço oficial do Traefik que exibe Host, Headers, IP do cliente e detalhes de rede para teste de domínio.',
    iconName: 'Zap',
    defaultImage: 'traefik/whoami:latest',
    defaultPort: 80,
    defaultContainerName: 'whoami-test',
    isWebUI: true,
    suggestedDomainPrefix: 'whoami',
    fields: [],
    generateEnv: () => '# Traefik Whoami Test Service',
  },
];
