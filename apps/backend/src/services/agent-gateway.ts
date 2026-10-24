import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { prisma, logAudit } from '../db.js';

export interface AgentMetrics {
  dockerVersion?: string;
  osInfo?: string;
  containersCount?: number;
  cpuUsage?: number;
  memUsage?: number;
}

interface ConnectedAgent {
  hostId: string;
  hostName: string;
  ws: WebSocket;
  connectedAt: Date;
  bridgeServer?: net.Server;
  bridgePort?: number;
  activeStreams: Map<string, net.Socket>;
}

export class AgentGateway {
  private static instance: AgentGateway;
  private wss: WebSocketServer | null = null;
  private connectedAgents: Map<string, ConnectedAgent> = new Map();

  private constructor() {}

  public static getInstance(): AgentGateway {
    if (!AgentGateway.instance) {
      AgentGateway.instance = new AgentGateway();
    }
    return AgentGateway.instance;
  }

  /**
   * Configura o WebSocket Server acoplado ao servidor HTTP principal
   */
  public setupWebSocket(server: http.Server) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', async (request, socket, head) => {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);

      if (url.pathname === '/ws/agent') {
        const token = url.searchParams.get('token') || (request.headers['x-agent-token'] as string);

        if (!token) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        try {
          const host = await prisma.dockerHost.findFirst({
            where: { agentToken: token },
            include: { project: true },
          });

          if (!host) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }

          this.wss?.handleUpgrade(request, socket, head, (ws) => {
            this.handleAgentConnection(ws, host);
          });
        } catch (err: any) {
          console.error('[AgentGateway] Erro ao autenticar upgrade de WebSocket:', err);
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
          socket.destroy();
        }
      }
    });

    console.log('⚡ [AgentGateway] WebSocket Gateway inicializado na rota /ws/agent');
  }

  /**
   * Gerencia a conexão ativa de um Edge Agent
   */
  private async handleAgentConnection(ws: WebSocket, host: any) {
    const hostId = host.id;
    console.log(`🔌 [AgentGateway] Edge Agent conectado: Host "${host.name}" (${hostId})`);

    // Fecha conexão anterior se já existir
    if (this.connectedAgents.has(hostId)) {
      const prev = this.connectedAgents.get(hostId)!;
      try {
        prev.ws.close(1000, 'Substituído por nova conexão');
      } catch {}
    }

    const agent: ConnectedAgent = {
      hostId,
      hostName: host.name,
      ws,
      connectedAt: new Date(),
      activeStreams: new Map(),
    };

    this.connectedAgents.set(hostId, agent);

    // Atualiza status no banco de dados
    await prisma.dockerHost.update({
      where: { id: hostId },
      data: {
        status: 'ONLINE',
        lastPingAt: new Date(),
        errorMessage: null,
      },
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case 'heartbeat':
            await this.handleHeartbeat(hostId, msg.metrics);
            break;

          case 'stream_data':
            if (msg.streamId && agent.activeStreams.has(msg.streamId)) {
              const tcpSocket = agent.activeStreams.get(msg.streamId)!;
              const buffer = Buffer.from(msg.chunk, 'base64');
              tcpSocket.write(buffer);
            }
            break;

          case 'stream_close':
            if (msg.streamId && agent.activeStreams.has(msg.streamId)) {
              const tcpSocket = agent.activeStreams.get(msg.streamId)!;
              tcpSocket.end();
              agent.activeStreams.delete(msg.streamId);
            }
            break;

          case 'stream_error':
            if (msg.streamId && agent.activeStreams.has(msg.streamId)) {
              const tcpSocket = agent.activeStreams.get(msg.streamId)!;
              tcpSocket.destroy(new Error(msg.error || 'Erro no Edge Agent'));
              agent.activeStreams.delete(msg.streamId);
            }
            break;
        }
      } catch (e: any) {
        console.warn(`[AgentGateway] Mensagem inválida recebida do host "${hostId}":`, e.message);
      }
    });

    ws.on('close', async () => {
      console.log(`⚠️ [AgentGateway] Edge Agent desconectado: Host "${host.name}" (${hostId})`);
      this.cleanupAgent(hostId);
      await prisma.dockerHost.update({
        where: { id: hostId },
        data: {
          status: 'OFFLINE',
          errorMessage: 'Edge Agent desconectado',
        },
      });
    });

    ws.on('error', (err) => {
      console.error(`[AgentGateway] Erro no WebSocket do host "${hostId}":`, err.message);
    });

    // Envia confirmação de autenticação
    ws.send(JSON.stringify({ type: 'ready', hostId, serverTime: new Date().toISOString() }));
  }

  /**
   * Processa o heartbeat com métricas
   */
  private async handleHeartbeat(hostId: string, metrics?: AgentMetrics) {
    if (!metrics) return;

    try {
      await prisma.dockerHost.update({
        where: { id: hostId },
        data: {
          status: 'ONLINE',
          lastPingAt: new Date(),
          dockerVersion: metrics.dockerVersion || undefined,
          osInfo: metrics.osInfo || undefined,
          containersCount: typeof metrics.containersCount === 'number' ? metrics.containersCount : undefined,
          cpuUsage: typeof metrics.cpuUsage === 'number' ? metrics.cpuUsage : undefined,
          memUsage: typeof metrics.memUsage === 'number' ? metrics.memUsage : undefined,
          errorMessage: null,
        },
      });
    } catch (e: any) {
      console.error(`[AgentGateway] Erro ao salvar métricas do host "${hostId}":`, e.message);
    }
  }

  /**
   * Cria um servidor TCP local na porta 127.0.0.1:0 que redireciona o tráfego do Dockerode
   * de volta para o Edge Agent via WebSocket
   */
  public async createDockerBridge(hostId: string): Promise<number> {
    const agent = this.connectedAgents.get(hostId);
    if (!agent || agent.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Edge Agent para o Host "${hostId}" não está conectado no momento.`);
    }

    if (agent.bridgeServer && agent.bridgePort) {
      return agent.bridgePort;
    }

    const bridgeServer = net.createServer((tcpSocket) => {
      const streamId = crypto.randomUUID();
      agent.activeStreams.set(streamId, tcpSocket);

      // Notifica o Edge Agent para abrir stream com o socket Docker local dele
      agent.ws.send(JSON.stringify({ type: 'stream_open', streamId }));

      tcpSocket.on('data', (chunk) => {
        if (agent.ws.readyState === WebSocket.OPEN) {
          agent.ws.send(
            JSON.stringify({
              type: 'stream_data',
              streamId,
              chunk: chunk.toString('base64'),
            })
          );
        }
      });

      tcpSocket.on('close', () => {
        agent.activeStreams.delete(streamId);
        if (agent.ws.readyState === WebSocket.OPEN) {
          agent.ws.send(JSON.stringify({ type: 'stream_close', streamId }));
        }
      });

      tcpSocket.on('error', (err) => {
        agent.activeStreams.delete(streamId);
        if (agent.ws.readyState === WebSocket.OPEN) {
          agent.ws.send(JSON.stringify({ type: 'stream_close', streamId, error: err.message }));
        }
      });
    });

    const bridgePort = await new Promise<number>((resolve, reject) => {
      bridgeServer.listen(0, '127.0.0.1', () => {
        const addr = bridgeServer.address() as net.AddressInfo;
        resolve(addr.port);
      });
      bridgeServer.on('error', reject);
    });

    agent.bridgeServer = bridgeServer;
    agent.bridgePort = bridgePort;

    console.log(`🔌 [AgentGateway] Docker Bridge reverso ativo para Host "${hostId}" na porta 127.0.0.1:${bridgePort}`);
    return bridgePort;
  }

  /**
   * Limpa recursos associados a um agente desconectado
   */
  private cleanupAgent(hostId: string) {
    const agent = this.connectedAgents.get(hostId);
    if (!agent) return;

    for (const [, stream] of agent.activeStreams) {
      try {
        stream.destroy();
      } catch {}
    }
    agent.activeStreams.clear();

    if (agent.bridgeServer) {
      try {
        agent.bridgeServer.close();
      } catch {}
    }

    this.connectedAgents.delete(hostId);
  }

  /**
   * Verifica se o agente do host está conectado
   */
  public isAgentConnected(hostId: string): boolean {
    const agent = this.connectedAgents.get(hostId);
    return !!agent && agent.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Retorna informações dos agentes conectados
   */
  public getConnectedAgents() {
    return Array.from(this.connectedAgents.values()).map((a) => ({
      hostId: a.hostId,
      hostName: a.hostName,
      connectedAt: a.connectedAt,
      bridgePort: a.bridgePort,
      activeStreamsCount: a.activeStreams.size,
    }));
  }
}

export const agentGateway = AgentGateway.getInstance();
