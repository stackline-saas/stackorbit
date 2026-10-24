import { prisma, logAudit } from '../db.js';
import { dockerHostManager } from './docker-host-manager.js';

export interface SwarmNodeInfo {
  id: string;
  hostname: string;
  role: 'manager' | 'worker';
  status: 'ready' | 'down' | 'unknown';
  availability: 'active' | 'pause' | 'drain';
  ipAddress?: string;
  engineVersion?: string;
  leader?: boolean;
}

export class SwarmService {
  private static instance: SwarmService;

  private constructor() {}

  public static getInstance(): SwarmService {
    if (!SwarmService.instance) {
      SwarmService.instance = new SwarmService();
    }
    return SwarmService.instance;
  }

  /**
   * Inicializa um novo cluster Docker Swarm no Host especificado (que se torna o Manager líder)
   */
  public async initSwarm(
    projectId: string,
    managerHostId: string,
    advertiseAddr?: string
  ): Promise<{ managerToken: string; workerToken: string }> {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error('Projeto não encontrado.');

    const host = await prisma.dockerHost.findUnique({ where: { id: managerHostId } });
    if (!host) throw new Error('Host Manager não encontrado.');

    const docker = await dockerHostManager.getClientForHost(managerHostId);

    // Se advertiseAddr não for passado, tenta derivar do endpointUrl
    let finalAdvertiseAddr = advertiseAddr?.trim();
    if (!finalAdvertiseAddr) {
      if (host.endpointUrl.startsWith('ssh://')) {
        try {
          const u = new URL(host.endpointUrl);
          finalAdvertiseAddr = u.hostname;
        } catch {}
      } else if (host.endpointUrl.startsWith('tcp://')) {
        try {
          const u = new URL(host.endpointUrl.replace('tcp://', 'http://'));
          finalAdvertiseAddr = u.hostname;
        } catch {}
      }
    }

    const initOpts: any = {
      ListenAddr: '0.0.0.0:2377',
      ...(finalAdvertiseAddr ? { AdvertiseAddr: `${finalAdvertiseAddr}:2377` } : {}),
    };

    console.log(`🐳 [SwarmService] Inicializando Swarm no host "${host.name}" com opts:`, initOpts);
    await docker.swarmInit(initOpts);

    // Obtém tokens gerados
    const swarmInfo = await docker.swarmInspect();
    const managerToken = swarmInfo.JoinTokens?.Manager || '';
    const workerToken = swarmInfo.JoinTokens?.Worker || '';

    // Atualiza o projeto no banco de dados
    await prisma.project.update({
      where: { id: projectId },
      data: {
        type: 'SWARM',
        swarmJoinTokenManager: managerToken,
        swarmJoinTokenWorker: workerToken,
      },
    });

    // Marca o host como Swarm Manager
    await prisma.dockerHost.update({
      where: { id: managerHostId },
      data: {
        isSwarmManager: true,
      },
    });

    return { managerToken, workerToken };
  }

  /**
   * Obtém os tokens de adesão do cluster Swarm do projeto
   */
  public async getJoinTokens(projectId: string): Promise<{
    managerToken: string;
    workerToken: string;
    managerHost?: { id: string; name: string; endpointUrl: string };
  }> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        hosts: {
          where: { isSwarmManager: true },
        },
      },
    });

    if (!project) throw new Error('Projeto não encontrado.');

    const managerHost = project.hosts[0];
    if (managerHost && (!project.swarmJoinTokenWorker || !project.swarmJoinTokenManager)) {
      try {
        const docker = await dockerHostManager.getClientForHost(managerHost.id);
        const info = await docker.swarmInspect();
        const managerToken = info.JoinTokens?.Manager || '';
        const workerToken = info.JoinTokens?.Worker || '';

        await prisma.project.update({
          where: { id: projectId },
          data: {
            swarmJoinTokenManager: managerToken,
            swarmJoinTokenWorker: workerToken,
          },
        });

        return {
          managerToken,
          workerToken,
          managerHost: { id: managerHost.id, name: managerHost.name, endpointUrl: managerHost.endpointUrl },
        };
      } catch (e: any) {
        console.warn('[SwarmService] Não foi possível inspecionar Swarm dinamicamente:', e.message);
      }
    }

    return {
      managerToken: project.swarmJoinTokenManager || '',
      workerToken: project.swarmJoinTokenWorker || '',
      managerHost: managerHost ? { id: managerHost.id, name: managerHost.name, endpointUrl: managerHost.endpointUrl } : undefined,
    };
  }

  /**
   * Adiciona um host secundário existente ao cluster Swarm do projeto como Worker ou Manager
   */
  public async joinSwarm(
    projectId: string,
    workerHostId: string,
    role: 'WORKER' | 'MANAGER' = 'WORKER'
  ): Promise<boolean> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        hosts: {
          where: { isSwarmManager: true },
        },
      },
    });

    if (!project) throw new Error('Projeto não encontrado.');
    const managerHost = project.hosts[0];
    if (!managerHost) throw new Error('Nenhum nó Manager encontrado para este projeto.');

    const workerHost = await prisma.dockerHost.findUnique({ where: { id: workerHostId } });
    if (!workerHost) throw new Error('Host para ingressar no cluster não encontrado.');

    const token = role === 'MANAGER' ? project.swarmJoinTokenManager : project.swarmJoinTokenWorker;
    if (!token) throw new Error('Token de ingresso do cluster não disponível.');

    // Extrai o IP/host do nó Manager
    let managerIp = '127.0.0.1';
    if (managerHost.endpointUrl.startsWith('ssh://')) {
      try {
        managerIp = new URL(managerHost.endpointUrl).hostname;
      } catch {}
    } else if (managerHost.endpointUrl.startsWith('tcp://')) {
      try {
        managerIp = new URL(managerHost.endpointUrl.replace('tcp://', 'http://')).hostname;
      } catch {}
    }

    const workerDocker = await dockerHostManager.getClientForHost(workerHostId);

    console.log(`🐳 [SwarmService] Unindo host "${workerHost.name}" ao Swarm do manager ${managerIp}:2377 como ${role}...`);
    await workerDocker.swarmJoin({
      ListenAddr: '0.0.0.0:2377',
      RemoteAddrs: [`${managerIp}:2377`],
      JoinToken: token,
    });

    await prisma.dockerHost.update({
      where: { id: workerHostId },
      data: {
        isSwarmManager: role === 'MANAGER',
      },
    });

    return true;
  }

  /**
   * Remove um host do cluster Swarm
   */
  public async leaveSwarm(hostId: string, force: boolean = true): Promise<boolean> {
    const host = await prisma.dockerHost.findUnique({ where: { id: hostId } });
    if (!host) throw new Error('Host não encontrado.');

    const docker = await dockerHostManager.getClientForHost(hostId);
    await docker.swarmLeave({ force });

    await prisma.dockerHost.update({
      where: { id: hostId },
      data: {
        isSwarmManager: false,
        swarmNodeId: null,
      },
    });

    return true;
  }

  /**
   * Lista todos os nós do cluster Swarm a partir do Manager do projeto
   */
  public async listNodes(projectId: string): Promise<SwarmNodeInfo[]> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        hosts: {
          where: { isSwarmManager: true },
        },
      },
    });

    if (!project || project.hosts.length === 0) {
      return [];
    }

    const managerHost = project.hosts[0];
    const docker = await dockerHostManager.getClientForHost(managerHost.id);

    try {
      const rawNodes = await docker.listNodes();
      return (rawNodes || []).map((n: any) => ({
        id: n.ID,
        hostname: n.Description?.Hostname || n.ID.slice(0, 12),
        role: n.Spec?.Role || 'worker',
        status: n.Status?.State === 'ready' ? 'ready' : (n.Status?.State === 'down' ? 'down' : 'unknown'),
        availability: n.Spec?.Availability || 'active',
        ipAddress: n.Status?.Addr,
        engineVersion: n.Description?.Engine?.EngineVersion,
        leader: n.ManagerStatus?.Leader || false,
      }));
    } catch (err: any) {
      console.warn(`[SwarmService] Erro ao listar nós do Swarm no projeto "${projectId}":`, err.message);
      return [];
    }
  }
}

export const swarmService = SwarmService.getInstance();
