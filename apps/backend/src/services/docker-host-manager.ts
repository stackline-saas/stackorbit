import Docker from 'dockerode';
import net from 'node:net';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { prisma } from '../db.js';
import { agentGateway } from './agent-gateway.js';

export interface DockerPingResult {
  success: boolean;
  latencyMs: number;
  dockerVersion?: string;
  osInfo?: string;
  containersCount?: number;
  error?: string;
}

export interface SSHBridgeSession {
  server: net.Server;
  port: number;
  endpointUrl: string;
}

export class DockerHostManager {
  private static instance: DockerHostManager;
  private clientPool: Map<string, Docker> = new Map();
  private sshBridges: Map<string, SSHBridgeSession> = new Map();

  private constructor() {}

  public static getInstance(): DockerHostManager {
    if (!DockerHostManager.instance) {
      DockerHostManager.instance = new DockerHostManager();
    }
    return DockerHostManager.instance;
  }

  /**
   * Retorna um cliente Dockerode configurado para o Host especificado.
   * Se omitido, retorna o cliente do Host padrão.
   */
  public async getClientForHost(hostId?: string | null): Promise<Docker> {
    if (!hostId || hostId === 'default' || hostId === 'default-host') {
      const defaultHost = await this.getDefaultHost();
      return this.getOrCreateClient(defaultHost);
    }

    if (this.clientPool.has(hostId)) {
      return this.clientPool.get(hostId)!;
    }

    const host = await prisma.dockerHost.findUnique({ where: { id: hostId } });
    if (!host) {
      // Fallback para o host padrão caso o ID não exista
      const defaultHost = await this.getDefaultHost();
      return this.getOrCreateClient(defaultHost);
    }

    return this.getOrCreateClient(host);
  }

  /**
   * Obtém ou inicializa o Host padrão do sistema
   */
  public async getDefaultHost() {
    let host = await prisma.dockerHost.findFirst({
      where: { isDefault: true },
    });

    if (!host) {
      host = await prisma.dockerHost.findFirst();
    }

    if (!host) {
      // Cria o host padrão dinamicamente
      const defaultProject = await prisma.project.upsert({
        where: { slug: 'default' },
        update: {},
        create: {
          name: 'Projeto Principal',
          slug: 'default',
          description: 'Ambiente principal de produção',
          type: 'STANDALONE',
          isDefault: true,
        },
      });

      host = await prisma.dockerHost.create({
        data: {
          id: 'default-host',
          name: 'Servidor Principal (Docker Local)',
          projectId: defaultProject.id,
          type: process.env.DOCKER_HOST?.startsWith('ssh://') ? 'SSH' : 'LOCAL_SOCKET',
          endpointUrl: process.env.DOCKER_HOST || process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
          status: 'ONLINE',
          isDefault: true,
        },
      });
    }

    return host;
  }

  /**
   * Inicializa e armazena em cache o cliente Dockerode
   */
  private async getOrCreateClient(host: {
    id: string;
    type: string;
    endpointUrl: string;
    sshKey?: string | null;
    sshUser?: string | null;
    sshPassword?: string | null;
    tlsCa?: string | null;
    tlsCert?: string | null;
    tlsKey?: string | null;
  }): Promise<Docker> {
    if (this.clientPool.has(host.id)) {
      return this.clientPool.get(host.id)!;
    }

    let client: Docker;

    switch (host.type) {
      case 'SSH':
        client = await this.createSSHClient(host.id, host.endpointUrl, host.sshKey);
        break;

      case 'TCP_TLS':
        client = this.createTlsClient(host.endpointUrl, host.tlsCa, host.tlsCert, host.tlsKey);
        break;

      case 'EDGE_AGENT':
        client = await this.createEdgeAgentClient(host.id);
        break;

      case 'LOCAL_SOCKET':
      default:
        client = this.createLocalSocketClient(host.endpointUrl);
        break;
    }

    this.clientPool.set(host.id, client);
    return client;
  }

  /**
   * Conexão via Socket Local (Linux / Windows Named Pipe)
   */
  private createLocalSocketClient(socketPath?: string): Docker {
    const defaultSocket = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';
    const targetSocket = socketPath && socketPath.startsWith('/') && fs.existsSync(socketPath)
      ? socketPath
      : defaultSocket;

    return new Docker({ socketPath: targetSocket });
  }

  /**
   * Conexão SSH usando túnel local 'docker system dial-stdio'
   */
  private async createSSHClient(hostId: string, endpointUrl: string, privateKey?: string | null): Promise<Docker> {
    // Se já existir uma bridge ativa para esse host, reutiliza
    if (this.sshBridges.has(hostId)) {
      const bridge = this.sshBridges.get(hostId)!;
      delete process.env.DOCKER_HOST;
      return new Docker({ host: '127.0.0.1', port: bridge.port });
    }

    let tempKeyFile: string | null = null;
    const sshEnv: NodeJS.ProcessEnv = { ...process.env, DOCKER_HOST: endpointUrl };

    if (privateKey && privateKey.trim()) {
      const tempDir = path.join(os.tmpdir(), 'ddm-ssh-keys');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      tempKeyFile = path.join(tempDir, `key-${hostId}-${Date.now()}.pem`);
      fs.writeFileSync(tempKeyFile, privateKey.trim() + '\n', { mode: 0o600 });
      // Se tiver chave privada customizada, configura SSH_COMMAND
      sshEnv.GIT_SSH_COMMAND = `ssh -i "${tempKeyFile}" -o StrictHostKeyChecking=no`;
    }

    const bridgeServer = net.createServer((socket) => {
      const child = spawn('docker', ['-H', endpointUrl, 'system', 'dial-stdio'], {
        env: sshEnv,
        windowsHide: true,
      });

      child.stderr.on('data', (d) => {
        console.error(`[DockerSSHBridge ${hostId} STDERR]:`, d.toString().trim());
      });

      socket.pipe(child.stdin);
      child.stdout.pipe(socket);
      child.on('error', (e) => socket.destroy(e));
      socket.on('error', () => child.kill());
      socket.on('close', () => child.kill());
    });

    const bridgePort = await new Promise<number>((resolve, reject) => {
      bridgeServer.listen(0, '127.0.0.1', () => {
        const addr = bridgeServer.address() as net.AddressInfo;
        resolve(addr.port);
      });
      bridgeServer.on('error', reject);
    });

    this.sshBridges.set(hostId, {
      server: bridgeServer,
      port: bridgePort,
      endpointUrl,
    });

    console.log(`🔌 [DockerHostManager] SSH Bridge ativo para Host "${hostId}" na porta 127.0.0.1:${bridgePort} (${endpointUrl})`);
    delete process.env.DOCKER_HOST;
    return new Docker({ host: '127.0.0.1', port: bridgePort });
  }

  /**
   * Conexão TCP / mTLS
   */
  private createTlsClient(endpointUrl: string, ca?: string | null, cert?: string | null, key?: string | null): Docker {
    const rawUrl = endpointUrl.replace('tcp://', 'https://');
    const url = new URL(rawUrl);

    const dockerOpts: any = {
      host: url.hostname,
      port: Number(url.port) || 2376,
    };

    if (ca) dockerOpts.ca = Buffer.from(ca);
    if (cert) dockerOpts.cert = Buffer.from(cert);
    if (key) dockerOpts.key = Buffer.from(key);

    return new Docker(dockerOpts);
  }

  /**
   * Conexão via Edge Agent reverso sobre WebSocket
   */
  private async createEdgeAgentClient(hostId: string): Promise<Docker> {
    const bridgePort = await agentGateway.createDockerBridge(hostId);
    return new Docker({ host: '127.0.0.1', port: bridgePort });
  }

  /**
   * Teste de conectividade e ping em tempo real para um host
   */
  public async testConnection(hostData: {
    type: string;
    endpointUrl: string;
    sshKey?: string | null;
    tlsCa?: string | null;
    tlsCert?: string | null;
    tlsKey?: string | null;
    hostId?: string;
  }): Promise<DockerPingResult> {
    const start = Date.now();
    try {
      if (hostData.type === 'EDGE_AGENT') {
        const isOnline = hostData.hostId ? agentGateway.isAgentConnected(hostData.hostId) : false;
        return {
          success: true,
          latencyMs: 1,
          dockerVersion: isOnline ? 'Online via Edge Agent' : 'Aguardando inicialização do agente',
          osInfo: isOnline ? 'Conectado via WebSocket' : 'Aguardando agente conectar',
          containersCount: 0,
        };
      }

      let testClient: Docker;
      const tempId = hostData.hostId || `test-${Date.now()}`;

      if (hostData.type === 'SSH') {
        testClient = await this.createSSHClient(tempId, hostData.endpointUrl, hostData.sshKey);
      } else if (hostData.type === 'TCP_TLS') {
        testClient = this.createTlsClient(hostData.endpointUrl, hostData.tlsCa, hostData.tlsCert, hostData.tlsKey);
      } else {
        testClient = this.createLocalSocketClient(hostData.endpointUrl);
      }

      await testClient.ping();
      const latencyMs = Date.now() - start;

      let dockerVersion: string | undefined;
      let osInfo: string | undefined;
      let containersCount: number | undefined;

      try {
        const versionData = await testClient.version();
        dockerVersion = versionData.Version;
        osInfo = `${versionData.Os} (${versionData.Arch})`;
      } catch {}

      try {
        const infoData = await testClient.info();
        containersCount = infoData.Containers;
      } catch {}

      return {
        success: true,
        latencyMs,
        dockerVersion,
        osInfo,
        containersCount,
      };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: err.message || 'Falha na conexão com o Docker Daemon remoto.',
      };
    }
  }

  /**
   * Atualiza as métricas de saúde e status do Host no banco de dados
   */
  public async syncHostMetrics(hostId: string): Promise<DockerPingResult> {
    const host = await prisma.dockerHost.findUnique({ where: { id: hostId } });
    if (!host) {
      return { success: false, latencyMs: 0, error: 'Host não encontrado.' };
    }

    const result = await this.testConnection({
      hostId: host.id,
      type: host.type,
      endpointUrl: host.endpointUrl,
      sshKey: host.sshKey,
      tlsCa: host.tlsCa,
      tlsCert: host.tlsCert,
      tlsKey: host.tlsKey,
    });

    await prisma.dockerHost.update({
      where: { id: hostId },
      data: {
        status: result.success ? 'ONLINE' : 'ERROR',
        lastPingAt: new Date(),
        dockerVersion: result.dockerVersion || host.dockerVersion,
        osInfo: result.osInfo || host.osInfo,
        containersCount: result.containersCount ?? host.containersCount,
        errorMessage: result.success ? null : result.error,
      },
    });

    return result;
  }

  /**
   * Invalida a conexão de um Host para forçar reconexão na próxima chamada
   */
  public invalidateClient(hostId: string): void {
    if (this.sshBridges.has(hostId)) {
      const bridge = this.sshBridges.get(hostId)!;
      try {
        bridge.server.close();
      } catch {}
      this.sshBridges.delete(hostId);
    }
    this.clientPool.delete(hostId);
  }
}

export const dockerHostManager = DockerHostManager.getInstance();
