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
  containerId?: string;
  image: string;
  internalPort: number;
  status: 'running' | 'stopped' | 'restarting' | 'error' | 'not_found';
  isActive: boolean;
  isDefault: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  domains?: Domain[];
  // Origem da Imagem: Docker Hub / Registry ou GitHub
  sourceType?: 'IMAGE' | 'GITHUB';
  gitRepoUrl?: string;
  gitBranch?: string;
  dockerfilePath?: string;
  gitToken?: string;
  buildContext?: string;
  envVars?: string;
  webhookSecret?: string;
  lastBuiltAt?: string;
  buildStatus?: 'idle' | 'cloning' | 'building' | 'success' | 'failed';
  buildLogs?: string;
  restartPolicy?: 'always' | 'unless-stopped' | 'on-failure' | 'no';
  memoryLimitMb?: number;
  cpuLimit?: number;
  command?: string;
  volumes?: string;
  network?: string;
  containerCount?: number;
  projectId?: string | null;
  project?: { id: string; name: string; slug: string; type: string } | null;
  dockerHostId?: string | null;
  dockerHost?: { id: string; name: string; status: string; type: string; isSwarmManager?: boolean } | null;
  isSwarm?: boolean;
  meta?: {
    composeProject?: string;
    linkedContainers?: string[];
    gitToken?: string;
    buildContext?: string;
    buildArgs?: Record<string, string>;
    primaryContainer?: string;
    primaryPort?: number;
    instanceEnvs?: Record<string, string>;
    isSite?: boolean;
    siteType?: 'STATIC' | 'PHP' | 'WORDPRESS' | 'ECOMMERCE';
    documentRoot?: string;
    sftpUser?: string;
    sftpPassword?: string;
    sftpPort?: number;
    hasPendingChanges?: boolean;
    lastPublishedAt?: string;
  };
}

export interface BuildLogRecord {
  id: string;
  serviceId: string;
  status: 'cloning' | 'building' | 'success' | 'failed';
  logs: string;
  gitCommit?: string | null;
  startedAt: string;
  finishedAt?: string | null;
}

export type ActiveTab =
  | 'dashboard'
  | 'projects'
  | 'hosts'
  | 'services'
  | 'service-detail'
  | 'sites'
  | 'databases'
  | 'domains'
  | 'default-service'
  | 'containers'
  | 'integrations'
  | 'traefik'
  | 'cloudflare'
  | 'audit'
  | 'tests'
  | 'settings';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  type: 'STANDALONE' | 'SWARM';
  isDefault: boolean;
  hostsCount?: number;
  servicesCount?: number;
  hosts?: DockerHost[];
  createdAt: string;
  updatedAt: string;
}

export interface DockerHost {
  id: string;
  name: string;
  projectId: string;
  projectName?: string;
  projectType?: 'STANDALONE' | 'SWARM';
  type: 'LOCAL_SOCKET' | 'SSH' | 'TCP_TLS' | 'EDGE_AGENT';
  status: 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'ERROR';
  endpointUrl: string;
  sshUser?: string | null;
  isDefault: boolean;
  isSwarmManager: boolean;
  swarmNodeId?: string | null;
  agentToken?: string | null;
  isAgentConnected?: boolean;
  cpuUsage?: number | null;
  memUsage?: number | null;
  dockerVersion?: string | null;
  osInfo?: string | null;
  containersCount?: number;
  servicesCount?: number;
  lastPingAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GitProviderAccount {
  id: string;
  provider: 'github' | 'gitlab' | 'bitbucket';
  name: string;
  accountName?: string;
  accountUrl?: string;
  avatarUrl?: string;
  tokenType: 'oauth' | 'pat';
  scopes?: string;
  metadata?: {
    publicRepos?: number;
    privateRepos?: number;
    email?: string;
  } | null;
  isActive: boolean;
  tokenMasked?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubRepoItem {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  ownerAvatar?: string;
  private: boolean;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  description?: string;
  language?: string;
  updatedAt: string;
  stars?: number;
}

export interface GitHubBranchItem {
  name: string;
  commitHash?: string;
}

export interface ProjectInspectionResult {
  hasDockerfile: boolean;
  detectedDockerfile: string;
  hasCompose?: boolean;
  detectedComposeFile?: string;
  definitionType?: 'compose' | 'dockerfile';
  composeCandidates?: string[];
  dockerfileCandidates?: string[];
  envCandidates?: string[];
  suggestedBuildContext: string;
  suggestedPort: number;
  detectedType: string;
  token?: string;
}

export interface BuildLogEntry {
  serviceId: string;
  serviceName: string;
  status: 'cloning' | 'building' | 'success' | 'failed';
  logs: string;
  startedAt: string;
  finishedAt?: string;
  gitCommit?: string;
}

export interface Domain {
  id: string;
  domainName: string;
  serviceId: string;
  targetContainer?: string;
  targetPort?: number;
  healthCheckPath?: string;
  loadBalanceMode?: string;
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
  appliedByName?: string;
  status: 'applied' | 'generated' | 'failed';
  errorMessage?: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  userName: string;
  action: string;
  entityType: 'SERVICE' | 'DOMAIN' | 'PROXY' | 'CONTAINER' | 'SETTINGS' | 'AUTH';
  entityId?: string;
  details: string;
  ipAddress?: string;
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
  composeProject?: string;
  composeService?: string;
  labels?: Record<string, string>;
  networks?: string[];
  isPrimary?: boolean;
  isOnProxyNet?: boolean;
  isManuallyLinked?: boolean;
}

export interface ComposeProjectSummary {
  projectName: string;
  workingDir?: string;
  containersCount: number;
  containers: DockerContainerInfo[];
  isImported: boolean;
  serviceId?: string | null;
  serviceName?: string | null;
  suggestedContainerName?: string;
  suggestedPort?: number;
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
  enableBetaFeatures?: boolean;
  isProduction?: boolean;
}

export interface TestResult {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  detail: string;
  durationMs: number;
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
  category: 'database' | 'cache_queue' | 'tools_web' | 'sites_cms';
  categoryLabel: string;
  description: string;
  iconName: string;
  defaultImage: string;
  defaultPort: number;
  defaultContainerName: string;
  isWebUI: boolean;
  suggestedDomainPrefix?: string;
  isSite?: boolean;
  siteType?: 'STATIC' | 'PHP' | 'WORDPRESS' | 'ECOMMERCE';
  documentRoot?: string;
  hasDatabaseCompanion?: boolean;
  fields: TemplateField[];
  generateEnv: (values: Record<string, string>) => string;
  generateConnectionString?: (values: Record<string, string>, containerName: string) => string;
}

export type {
  SiteFile,
  SiteSFTPCredentials,
  DatabaseColumn,
  DatabaseForeignKey,
  DatabaseTable,
  DatabaseCatalog,
  RedisKeyInfo,
  RedisServerMetrics,
} from '@stackorbit/shared';
