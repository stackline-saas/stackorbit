import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { User, Service, Domain, ProxyConfiguration, AuditLog, AppSettings, DockerContainerInfo } from '../types/index.ts';

// Hashing helper using PBKDF2
export function hashPassword(password: string, salt = 'docker-domain-manager-salt-2026'): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

export function verifyPassword(password: string, hash: string, salt = 'docker-domain-manager-salt-2026'): boolean {
  const computed = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

interface DatabaseSchema {
  users: Array<User & { passwordHash: string }>;
  services: Service[];
  domains: Domain[];
  proxyConfigurations: ProxyConfiguration[];
  auditLogs: AuditLog[];
  settings: AppSettings;
  containers: DockerContainerInfo[];
  sessions: Array<{ token: string; userId: string; expiresAt: number }>;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.resolve(DATA_DIR, 'db.json');

function getInitialData(): DatabaseSchema {
  const initialAdminId = 'user_admin_01';
  const initialServiceApiId = 'srv_api_01';
  const initialServiceAdminId = 'srv_admin_02';
  const initialServiceDefaultId = 'srv_default_03';

  return {
    users: [
      {
        id: initialAdminId,
        name: 'Administrador Docker',
        email: 'admin@bla.com.br',
        passwordHash: hashPassword('admin123'),
        role: 'ADMIN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    services: [
      {
        id: initialServiceApiId,
        name: 'API Backend',
        containerName: 'api',
        containerId: 'c_api_883a1f9e2b',
        image: 'node:20-alpine',
        internalPort: 8080,
        status: 'running',
        isActive: true,
        isDefault: false,
        notes: 'API REST principal para microserviços',
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: initialServiceAdminId,
        name: 'Painel Admin',
        containerName: 'admin',
        containerId: 'c_admin_441c0e3a9d',
        image: 'nginx:alpine',
        internalPort: 80,
        status: 'running',
        isActive: true,
        isDefault: false,
        notes: 'Interface de gestão de retaguarda',
        createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: initialServiceDefaultId,
        name: 'Portal Geral (Padrão)',
        containerName: 'web-portal',
        containerId: 'c_portal_992d1a4e7c',
        image: 'caddy:alpine',
        internalPort: 80,
        status: 'running',
        isActive: true,
        isDefault: true,
        notes: 'Serviço fallback para qualquer domínio não mapeado no Traefik',
        createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
        updatedAt: new Date().toISOString(),
        sourceType: 'IMAGE',
      },
      {
        id: 'srv_git_04',
        name: 'Node App (GitHub CI/CD)',
        containerName: 'node-app-git',
        containerId: 'c_git_771b9e2a',
        image: 'node-app-git:latest',
        internalPort: 3000,
        status: 'running',
        isActive: true,
        isDefault: false,
        sourceType: 'GITHUB',
        gitRepoUrl: 'https://github.com/exemplo/api-node-docker.git',
        gitBranch: 'main',
        dockerfilePath: 'Dockerfile',
        envVars: 'NODE_ENV=production\nPORT=3000',
        webhookSecret: 'whsec_99a81f3e7b2',
        lastBuiltAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        buildStatus: 'success',
        buildLogs: `[2026-10-21T08:30:12Z] Clonando repositório https://github.com/exemplo/api-node-docker.git (branch: main)...
[Git] Commit checkout: 8f2a1e9 - "feat: add docker healthcheck"
[Docker] Executando build com Dockerfile...
Step 1/6 : FROM node:20-alpine
Step 2/6 : WORKDIR /app
Step 3/6 : COPY package*.json ./
Step 4/6 : RUN npm install --production
Step 5/6 : COPY . .
Step 6/6 : EXPOSE 3000
Successfully built 8f2a1e9
Successfully tagged node-app-git:latest
[Deploy] Container node-app-git iniciado na rede [proxy-net]
[Traefik] Roteamento atualizado`,
        notes: 'Construído diretamente a partir do repositório GitHub com push-to-deploy',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    domains: [
      {
        id: 'dom_01',
        domainName: 'api.bla.com.br',
        serviceId: initialServiceApiId,
        isActive: true,
        sslStatus: 'cloudflare_proxied',
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'dom_02',
        domainName: 'admin.bla.com.br',
        serviceId: initialServiceAdminId,
        isActive: true,
        sslStatus: 'cloudflare_proxied',
        createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'dom_03',
        domainName: 'app.bla.com.br',
        serviceId: 'srv_git_04',
        isActive: true,
        sslStatus: 'cloudflare_proxied',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    proxyConfigurations: [
      {
        id: 'cfg_initial_01',
        version: 1,
        contentYaml: `# Configuração Dinâmica Traefik Gerada Automaticamente
# Conexão de Origem com Certificado Cloudflare Origin CA
http:
  routers:
    router-api:
      rule: "Host(\`api.bla.com.br\`)"
      service: "service-api"
      priority: 100
      tls: {}
    router-admin:
      rule: "Host(\`admin.bla.com.br\`)"
      service: "service-admin"
      priority: 100
      tls: {}
    router-default-fallback:
      rule: "HostRegexp(\`{host:.+}\`)"
      service: "service-web-portal"
      priority: 1
      tls: {}
  services:
    service-api:
      loadBalancer:
        servers:
          - url: "http://api:8080"
    service-admin:
      loadBalancer:
        servers:
          - url: "http://admin:80"
    service-web-portal:
      loadBalancer:
        servers:
          - url: "http://web-portal:80"
tls:
  certificates:
    - certFile: "/etc/traefik/certs/origin.pem"
      keyFile: "/etc/traefik/certs/origin.key"
`,
        appliedAt: new Date(Date.now() - 86400000).toISOString(),
        appliedBy: initialAdminId,
        appliedByName: 'Administrador Docker',
        status: 'applied',
      },
    ],
    auditLogs: [
      {
        id: 'log_01',
        userId: initialAdminId,
        userName: 'Administrador Docker',
        action: 'SISTEMA_INICIADO',
        entityType: 'SETTINGS',
        details: 'Banco de dados inicializado com sucesso e regras carregadas.',
        ipAddress: '127.0.0.1',
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      },
      {
        id: 'log_02',
        userId: initialAdminId,
        userName: 'Administrador Docker',
        action: 'DOMINIO_CRIADO',
        entityType: 'DOMAIN',
        entityId: 'dom_01',
        details: 'Domínio api.bla.com.br associado ao serviço API Backend (:8080)',
        ipAddress: '127.0.0.1',
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      },
      {
        id: 'log_03',
        userId: initialAdminId,
        userName: 'Administrador Docker',
        action: 'DOMINIO_CRIADO',
        entityType: 'DOMAIN',
        entityId: 'dom_02',
        details: 'Domínio admin.bla.com.br associado ao serviço Painel Admin (:80)',
        ipAddress: '127.0.0.1',
        createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
      },
      {
        id: 'log_04',
        userId: initialAdminId,
        userName: 'Administrador Docker',
        action: 'SERVICO_PADRAO_DEFINIDO',
        entityType: 'SERVICE',
        entityId: initialServiceDefaultId,
        details: 'Serviço Portal Geral (web-portal:80) configurado como roteamento padrão HostRegexp({host:.+})',
        ipAddress: '127.0.0.1',
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
      {
        id: 'log_05',
        userId: initialAdminId,
        userName: 'Administrador Docker',
        action: 'TRAEFIK_CONFIG_APLICADA',
        entityType: 'PROXY',
        entityId: 'cfg_initial_01',
        details: 'Configuração dinâmica v1 do Traefik gerada e validada.',
        ipAddress: '127.0.0.1',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
    settings: {
      id: 'settings_01',
      mainDomain: 'bla.com.br',
      originServerIp: '198.51.100.25',
      originHttpsPort: 443,
      cloudflareSslMode: 'Full (strict)',
      dockerSocketPath: '/var/run/docker.sock',
      traefikDynamicConfigPath: './traefik/dynamic/dynamic_conf.yml',
      autoApplyTraefik: true,
      defaultFallbackEnabled: true,
      updatedAt: new Date().toISOString(),
    },
    containers: [
      {
        id: 'c_api_883a1f9e2b',
        name: 'api',
        image: 'node:20-alpine',
        status: 'running',
        state: 'Up 4 days (healthy)',
        ports: [{ privatePort: 8080, type: 'tcp' }],
        created: Math.floor((Date.now() - 86400000 * 5) / 1000),
        command: 'node dist/server.js',
      },
      {
        id: 'c_admin_441c0e3a9d',
        name: 'admin',
        image: 'nginx:alpine',
        status: 'running',
        state: 'Up 4 days',
        ports: [{ privatePort: 80, type: 'tcp' }],
        created: Math.floor((Date.now() - 86400000 * 4) / 1000),
        command: 'nginx -g "daemon off;"',
      },
      {
        id: 'c_portal_992d1a4e7c',
        name: 'web-portal',
        image: 'caddy:alpine',
        status: 'running',
        state: 'Up 6 days',
        ports: [{ privatePort: 80, type: 'tcp' }],
        created: Math.floor((Date.now() - 86400000 * 6) / 1000),
        command: 'caddy run --config /etc/caddy/Caddyfile',
      },
      {
        id: 'c_postgres_551a0e9f1a',
        name: 'postgres-db',
        image: 'postgres:16-alpine',
        status: 'running',
        state: 'Up 7 days',
        ports: [{ privatePort: 5432, type: 'tcp' }],
        created: Math.floor((Date.now() - 86400000 * 7) / 1000),
        command: 'docker-entrypoint.sh postgres',
      },
      {
        id: 'c_traefik_773b4e1a8e',
        name: 'traefik-proxy',
        image: 'traefik:v3.1',
        status: 'running',
        state: 'Up 7 days',
        ports: [
          { privatePort: 80, publicPort: 80, type: 'tcp' },
          { privatePort: 443, publicPort: 443, type: 'tcp' },
          { privatePort: 8080, publicPort: 8080, type: 'tcp' },
        ],
        created: Math.floor((Date.now() - 86400000 * 7) / 1000),
        command: 'traefik --configFile=/etc/traefik/traefik.yml',
      },
    ],
    sessions: [],
  };
}

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Erro ao carregar banco de dados persistido, iniciando dados padrão:', err);
    }
    const initial = getInitialData();
    this.save(initial);
    return initial;
  }

  public save(newData?: DatabaseSchema): void {
    if (newData) {
      this.data = newData;
    }
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Erro ao persistir banco de dados:', err);
    }
  }

  // Users
  public getUsers() {
    return this.data.users;
  }

  public getUserById(id: string) {
    return this.data.users.find((u) => u.id === id);
  }

  public getUserByEmail(email: string) {
    return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  // Services
  public getServices(): Service[] {
    return this.data.services.map((svc) => ({
      ...svc,
      domains: this.data.domains.filter((d) => d.serviceId === svc.id),
    }));
  }

  public getServiceById(id: string): Service | undefined {
    const svc = this.data.services.find((s) => s.id === id);
    if (!svc) return undefined;
    return {
      ...svc,
      domains: this.data.domains.filter((d) => d.serviceId === svc.id),
    };
  }

  public createService(svc: Omit<Service, 'id' | 'createdAt' | 'updatedAt' | 'domains'>): Service {
    const id = `srv_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    
    // If this service is marked default, unset others
    if (svc.isDefault) {
      this.data.services.forEach((s) => {
        s.isDefault = false;
      });
    }

    const newService: Service = {
      ...svc,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.data.services.push(newService);
    this.save();
    return newService;
  }

  public updateService(id: string, updates: Partial<Service>): Service | null {
    const index = this.data.services.findIndex((s) => s.id === id);
    if (index === -1) return null;

    if (updates.isDefault) {
      this.data.services.forEach((s) => {
        if (s.id !== id) s.isDefault = false;
      });
    }

    const current = this.data.services[index];
    const updated: Service = {
      ...current,
      ...updates,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.data.services[index] = updated;
    this.save();
    return updated;
  }

  public async triggerServiceBuild(serviceId: string, commitInfo?: { hash?: string; message?: string }): Promise<Service | null> {
    const service = this.getServiceById(serviceId);
    if (!service) return null;

    const commit = commitInfo?.hash || Math.random().toString(16).substring(2, 9);
    const commitMsg = commitInfo?.message || 'Build iniciado manualmente pelo painel';
    const startedAt = new Date().toISOString();

    // 1. Marca status como 'building'
    this.updateService(serviceId, {
      buildStatus: 'building',
      buildLogs: `[${startedAt}] Iniciando pipeline de Build para ${service.name}...\n[Git] Conectando ao repositório: ${service.gitRepoUrl || 'https://github.com/exemplo/repo.git'} (branch: ${service.gitBranch || 'main'})\n`,
    });

    // Simula tempo de build
    await new Promise((resolve) => setTimeout(resolve, 1400));

    const finalLogs = [
      `[${startedAt}] [Pipeline CI/CD] Iniciando build do serviço: ${service.name}`,
      `[Git] git clone --depth 1 -b ${service.gitBranch || 'main'} ${service.gitRepoUrl || 'https://github.com/exemplo/repo.git'}`,
      `[Git] Commit ativo: ${commit} ("${commitMsg}")`,
      `[Docker] Analisando contexto de build e arquivo ${service.dockerfilePath || 'Dockerfile'}`,
      `[Docker] Step 1/6 : FROM ${service.image || 'node:20-alpine'} AS runtime`,
      `[Docker] Step 2/6 : WORKDIR /usr/src/app`,
      `[Docker] Step 3/6 : COPY package*.json ./`,
      `[Docker] Step 4/6 : RUN npm install --production --no-audit`,
      `[Docker] Step 5/6 : COPY . .`,
      `[Docker] Step 6/6 : EXPOSE ${service.internalPort}`,
      `[Docker] ---> ${commit}`,
      `[Docker] Successfully built image ${service.containerName}:latest`,
      `[Deploy] Parando container antigo e recriando com imagem ${service.containerName}:latest na rede [proxy-net]...`,
      `[Deploy] Inspecionando healthcheck... Container saudável (200 OK)`,
      `[Traefik] Sincronização automática de rota para ${service.containerName}:${service.internalPort} aplicada`,
      `[${new Date().toISOString()}] Pipeline concluído com SUCESSO!`,
    ].join('\n');

    const updated = this.updateService(serviceId, {
      buildStatus: 'success',
      status: 'running',
      lastBuiltAt: new Date().toISOString(),
      buildLogs: finalLogs,
    });

    // Atualiza status do container
    this.updateContainerStatus(service.containerName, 'running');

    return updated;
  }

  public deleteService(id: string): boolean {
    const index = this.data.services.findIndex((s) => s.id === id);
    if (index === -1) return false;

    // Delete associated domains
    this.data.domains = this.data.domains.filter((d) => d.serviceId !== id);
    this.data.services.splice(index, 1);
    this.save();
    return true;
  }

  public setDefaultService(serviceId: string | null): Service | null {
    this.data.services.forEach((s) => {
      s.isDefault = s.id === serviceId;
      s.updatedAt = new Date().toISOString();
    });
    this.save();
    return serviceId ? this.getServiceById(serviceId) || null : null;
  }

  // Domains
  public getDomains(): Domain[] {
    return this.data.domains.map((dom) => ({
      ...dom,
      service: this.data.services.find((s) => s.id === dom.serviceId),
    }));
  }

  public getDomainById(id: string): Domain | undefined {
    const dom = this.data.domains.find((d) => d.id === id);
    if (!dom) return undefined;
    return {
      ...dom,
      service: this.data.services.find((s) => s.id === dom.serviceId),
    };
  }

  public getDomainByName(name: string): Domain | undefined {
    return this.data.domains.find((d) => d.domainName.toLowerCase() === name.trim().toLowerCase());
  }

  public createDomain(dom: { domainName: string; serviceId: string; isActive?: boolean }): Domain {
    const id = `dom_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const cleanDomain = dom.domainName.trim().toLowerCase();

    const newDomain: Domain = {
      id,
      domainName: cleanDomain,
      serviceId: dom.serviceId,
      isActive: dom.isActive ?? true,
      sslStatus: 'cloudflare_proxied',
      createdAt: now,
      updatedAt: now,
    };
    this.data.domains.push(newDomain);
    this.save();
    return {
      ...newDomain,
      service: this.data.services.find((s) => s.id === dom.serviceId),
    };
  }

  public updateDomain(id: string, updates: Partial<Domain>): Domain | null {
    const index = this.data.domains.findIndex((d) => d.id === id);
    if (index === -1) return null;

    const current = this.data.domains[index];
    if (updates.domainName) {
      updates.domainName = updates.domainName.trim().toLowerCase();
    }
    const updated: Domain = {
      ...current,
      ...updates,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.data.domains[index] = updated;
    this.save();
    return {
      ...updated,
      service: this.data.services.find((s) => s.id === updated.serviceId),
    };
  }

  public deleteDomain(id: string): boolean {
    const index = this.data.domains.findIndex((d) => d.id === id);
    if (index === -1) return false;
    this.data.domains.splice(index, 1);
    this.save();
    return true;
  }

  // Traefik Revisions
  public getProxyConfigurations(): ProxyConfiguration[] {
    return [...this.data.proxyConfigurations].sort((a, b) => b.version - a.version);
  }

  public addProxyConfiguration(cfg: Omit<ProxyConfiguration, 'id' | 'version'>): ProxyConfiguration {
    const nextVersion = (this.data.proxyConfigurations[0]?.version || 0) + 1;
    const newCfg: ProxyConfiguration = {
      ...cfg,
      id: `cfg_v${nextVersion}_${Date.now()}`,
      version: nextVersion,
    };
    this.data.proxyConfigurations.unshift(newCfg);
    this.save();
    return newCfg;
  }

  // Audit Logs
  public getAuditLogs(limit = 100): AuditLog[] {
    return [...this.data.auditLogs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
  }

  public logAudit(entry: Omit<AuditLog, 'id' | 'createdAt'>): AuditLog {
    const newLog: AuditLog = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    this.data.auditLogs.unshift(newLog);
    // Keep max 500 audit logs
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    }
    this.save();
    return newLog;
  }

  // Settings
  public getSettings(): AppSettings {
    return this.data.settings;
  }

  public updateSettings(updates: Partial<AppSettings>): AppSettings {
    this.data.settings = {
      ...this.data.settings,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.settings;
  }

  // Containers (for engine management)
  public getContainers(): DockerContainerInfo[] {
    return this.data.containers;
  }

  public updateContainerStatus(containerNameOrId: string, status: 'running' | 'stopped' | 'restarting'): DockerContainerInfo | null {
    const c = this.data.containers.find(
      (item) => item.name === containerNameOrId || item.id === containerNameOrId
    );
    if (!c) return null;
    c.status = status;
    c.state = status === 'running' ? 'Up Just now' : status === 'stopped' ? 'Exited (0)' : 'Restarting';
    
    // Also update associated service status
    const s = this.data.services.find(
      (srv) => srv.containerName === c.name || srv.containerId === c.id
    );
    if (s) {
      s.status = status;
      s.updatedAt = new Date().toISOString();
    }
    this.save();
    return c;
  }

  // Sessions
  public createSession(userId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 86400000 * 7; // 7 days
    this.data.sessions.push({ token, userId, expiresAt });
    this.save();
    return token;
  }

  public validateSession(token: string): User | null {
    if (!token) return null;
    const session = this.data.sessions.find((s) => s.token === token && s.expiresAt > Date.now());
    if (!session) return null;
    const user = this.getUserById(session.userId);
    return user || null;
  }

  public deleteSession(token: string): void {
    this.data.sessions = this.data.sessions.filter((s) => s.token !== token);
    this.save();
  }
}

export const db = new Database();
