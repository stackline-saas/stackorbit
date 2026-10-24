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
}

export type ActiveTab =
  | 'dashboard'
  | 'services'
  | 'service-detail'
  | 'domains'
  | 'default-service'
  | 'containers'
  | 'traefik'
  | 'cloudflare'
  | 'audit'
  | 'tests'
  | 'settings';

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
  generateConnectionString?: (values: Record<string, string>, containerName: string) => string;
}
