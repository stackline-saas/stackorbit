import Docker from 'dockerode';
import { config } from '../config.js';
import { createDockerClient } from './docker-connection.js';
import { dockerHostManager } from './docker-host-manager.js';

export interface DockerPingStatus {
  connected: boolean;
  socketPath: string;
  isEmulated: boolean;
  version?: string;
  apiVersion?: string;
  os?: string;
  containersCount?: number;
}

export interface ContainerInfo {
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
  labels: Record<string, string>;
  networks: string[];
}

export class DockerService {
  public docker!: Docker;
  private initPromise: Promise<Docker>;

  constructor() {
    this.initPromise = dockerHostManager.getClientForHost().then((client) => {
      this.docker = client;
      return client;
    });
  }

  public async getClient(hostId?: string | null): Promise<Docker> {
    if (hostId) return dockerHostManager.getClientForHost(hostId);
    if (this.docker) return this.docker;
    return this.initPromise;
  }

  public async getStatus(hostId?: string | null): Promise<DockerPingStatus> {
    try {
      const docker = await this.getClient(hostId);
      const ping = await docker.ping();
      if (ping) {
        const versionInfo = await docker.version();
        const containers = await docker.listContainers({ all: true });

        return {
          connected: true,
          socketPath: process.env.DOCKER_HOST || config.dockerSocketPath,
          isEmulated: false,
          version: versionInfo.Version,
          apiVersion: versionInfo.ApiVersion,
          os: versionInfo.Os,
          containersCount: containers.length,
        };
      }
    } catch (err: any) {
      console.warn('Docker socket connection warning:', err.message);
    }

    return {
      connected: false,
      socketPath: config.dockerSocketPath,
      isEmulated: false,
    };
  }

  public async listContainers(hostId?: string | null): Promise<ContainerInfo[]> {
    try {
      const docker = await this.getClient(hostId);
      const rawContainers = await docker.listContainers({ all: true });
      return rawContainers.map((c) => {
        const rawName = c.Names && c.Names[0] ? c.Names[0].replace(/^\//, '') : c.Id.slice(0, 12);
        let status: 'running' | 'stopped' | 'paused' | 'restarting' = 'stopped';
        if (c.State === 'running') status = 'running';
        else if (c.State === 'paused') status = 'paused';
        else if (c.State === 'restarting') status = 'restarting';

        const labels = c.Labels || {};
        const composeProject = labels['com.docker.compose.project'];
        const composeService = labels['com.docker.compose.service'];
        const networks = c.NetworkSettings?.Networks ? Object.keys(c.NetworkSettings.Networks) : [];

        return {
          id: c.Id,
          name: rawName,
          image: c.Image,
          status,
          state: c.State,
          ports: (c.Ports || []).map((p) => ({
            ip: p.IP,
            privatePort: p.PrivatePort,
            publicPort: p.PublicPort,
            type: p.Type,
          })),
          created: c.Created,
          command: c.Command,
          composeProject,
          composeService,
          labels,
          networks,
        };
      });
    } catch (err: any) {
      console.error('Falha ao listar containers:', err.message);
      return [];
    }
  }

  public async getContainerLogs(nameOrId: string, tail = 100): Promise<string> {
    const container = this.docker.getContainer(nameOrId);
    const logBuffer = (await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
      follow: false,
    })) as unknown as Buffer;

    return this.demuxStream(logBuffer);
  }

  // Demultiplex Docker stream buffer (strips 8-byte header headers)
  private demuxStream(buffer: Buffer): string {
    if (!Buffer.isBuffer(buffer)) {
      return String(buffer || '');
    }

    let offset = 0;
    let output = '';

    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) {
        output += buffer.toString('utf-8', offset);
        break;
      }

      // Docker header: 1 byte type, 3 bytes zeros, 4 bytes big endian payload size
      const payloadSize = buffer.readUInt32BE(offset + 4);
      offset += 8;

      if (offset + payloadSize <= buffer.length) {
        output += buffer.toString('utf-8', offset, offset + payloadSize);
        offset += payloadSize;
      } else {
        output += buffer.toString('utf-8', offset);
        break;
      }
    }

    return output;
  }

  public async startContainer(nameOrId: string): Promise<void> {
    const container = this.docker.getContainer(nameOrId);
    try {
      await container.start();
    } catch (err: any) {
      // 304 means container already started
      if (err.statusCode === 304) return;
      throw err;
    }
  }

  public async stopContainer(nameOrId: string): Promise<void> {
    const container = this.docker.getContainer(nameOrId);
    try {
      await container.stop();
    } catch (err: any) {
      // 304 means container already stopped
      if (err.statusCode === 304) return;
      throw err;
    }
  }

  public async restartContainer(nameOrId: string): Promise<void> {
    const container = this.docker.getContainer(nameOrId);
    await container.restart();
  }

  public async removeContainer(nameOrId: string, force = true): Promise<void> {
    try {
      const container = this.docker.getContainer(nameOrId);
      await container.remove({ force });
    } catch (err: any) {
      if (err.statusCode === 404) return;
      throw err;
    }
  }

  public async execCommand(
    nameOrId: string,
    command: string,
    shell = '/bin/sh'
  ): Promise<{ output: string; exitCode: number; executionTimeMs: number }> {
    const startTime = Date.now();
    const container = this.docker.getContainer(nameOrId);

    const exec = await container.exec({
      Cmd: [shell, '-c', command],
      AttachStdout: true,
      AttachStderr: true,
    });

    return new Promise((resolve, reject) => {
      exec.start({ hijack: true, stdin: false }, (err, stream) => {
        if (err) return reject(err);
        if (!stream) return reject(new Error('Nenhum stream retornado pelo docker exec'));

        let outputChunks: Buffer[] = [];

        stream.on('data', (chunk: Buffer) => {
          outputChunks.push(chunk);
        });

        stream.on('end', async () => {
          const totalBuffer = Buffer.concat(outputChunks);
          const cleanOutput = this.demuxStream(totalBuffer);

          try {
            const inspectResult = await exec.inspect();
            resolve({
              output: cleanOutput,
              exitCode: inspectResult.ExitCode ?? 0,
              executionTimeMs: Date.now() - startTime,
            });
          } catch (inspectErr) {
            resolve({
              output: cleanOutput,
              exitCode: 0,
              executionTimeMs: Date.now() - startTime,
            });
          }
        });

        stream.on('error', (streamErr) => {
          reject(streamErr);
        });
      });
    });
  }

  public async ensureNetwork(networkName = config.networkName): Promise<void> {
    try {
      const networks = await this.docker.listNetworks();
      const exists = networks.some((n) => n.Name === networkName);
      if (!exists) {
        await this.docker.createNetwork({
          Name: networkName,
          Driver: 'bridge',
        });
      }
    } catch (err: any) {
      console.warn(`Aviso ao verificar rede Docker "${networkName}":`, err.message);
    }
  }

  public async attachToNetwork(
    containerNameOrId: string,
    networkName = config.networkName,
    aliases?: string[]
  ): Promise<void> {
    try {
      await this.ensureNetwork(networkName);
      const network = this.docker.getNetwork(networkName);
      const connectOpts: any = { Container: containerNameOrId };
      if (aliases && aliases.length > 0) {
        connectOpts.EndpointConfig = { Aliases: aliases };
      }
      await network.connect(connectOpts);
    } catch (err: any) {
      if (err.statusCode === 409 || err.message?.includes('already exists in network') || err.message?.includes('already connected')) {
        return;
      }
      console.warn(`Aviso ao conectar container "${containerNameOrId}" à rede "${networkName}":`, err.message);
    }
  }

  public async detachFromNetwork(containerNameOrId: string, networkName = config.networkName): Promise<void> {
    try {
      const network = this.docker.getNetwork(networkName);
      await network.disconnect({ Container: containerNameOrId, Force: true });
    } catch (err: any) {
      console.warn(`Aviso ao desconectar container "${containerNameOrId}" da rede "${networkName}":`, err.message);
    }
  }

  public async deployContainer(options: {
    containerName: string;
    image: string;
    envVars?: string;
    restartPolicy?: string;
    memoryLimitMb?: number;
    cpuLimit?: number;
    command?: string;
  }): Promise<string> {
    await this.ensureNetwork();

    // Remove old container if present
    await this.removeContainer(options.containerName, true);

    // Pull image if not local
    try {
      const images = await this.docker.listImages();
      const hasImage = images.some((img) =>
        img.RepoTags?.some((tag) => tag === options.image || tag.startsWith(`${options.image}:`))
      );
      if (!hasImage) {
        const stream = await this.docker.pull(options.image);
        await new Promise((resolve, reject) => {
          this.docker.modem.followProgress(stream, (err, res) => {
            if (err) reject(err);
            else resolve(res);
          });
        });
      }
    } catch (pullErr: any) {
      console.warn(`Aviso no pull da imagem ${options.image}:`, pullErr.message);
    }

    // Parse env vars
    const envArray: string[] = [];
    if (options.envVars) {
      options.envVars
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'))
        .forEach((line) => {
          envArray.push(line);
        });
    }

    // Host configuration
    const restartPolicyName = options.restartPolicy || 'unless-stopped';
    const hostConfig: Docker.HostConfig = {
      NetworkMode: config.networkName,
      RestartPolicy: {
        Name: restartPolicyName as any,
      },
    };

    if (options.memoryLimitMb && options.memoryLimitMb > 0) {
      hostConfig.Memory = options.memoryLimitMb * 1024 * 1024;
    }
    if (options.cpuLimit && options.cpuLimit > 0) {
      hostConfig.NanoCpus = Math.floor(options.cpuLimit * 1e9);
    }

    const container = await this.docker.createContainer({
      name: options.containerName,
      Image: options.image,
      Env: envArray,
      HostConfig: hostConfig,
      Cmd: options.command ? options.command.split(' ') : undefined,
    });

    await container.start();
    return container.id;
  }

  public async scaleServiceComponent(
    project: string | null | undefined,
    serviceName: string,
    targetCount: number,
    baseContainerName?: string,
    serviceId?: string
  ): Promise<{ added: string[]; removed: string[]; current: string[] }> {
    if (targetCount < 1) {
      throw new Error('A quantidade de réplicas deve ser de no mínimo 1.');
    }
    if (targetCount > 20) {
      throw new Error('Limite máximo de 20 réplicas por componente.');
    }

    const isCompose = Boolean(project);
    const cleanBase = (baseContainerName || serviceName).replace(/-\d+$/, '');

    const allContainers = await this.listContainers();
    const matched = allContainers.filter((c) => {
      if (serviceId && c.labels?.['com.docker.domain.service-id'] === serviceId) {
        return true;
      }
      if (isCompose && project) {
        const matchProject =
          c.composeProject?.toLowerCase() === project.toLowerCase() ||
          c.name.startsWith(`${project}-`) ||
          c.name.startsWith(`${project}_`);
        const matchService =
          c.composeService?.toLowerCase() === serviceName.toLowerCase() ||
          c.name.includes(`-${serviceName}-`) ||
          c.name.includes(`_${serviceName}_`) ||
          c.name.endsWith(`-${serviceName}`) ||
          c.name === serviceName;
        return matchProject && matchService;
      } else {
        return (
          c.name === cleanBase ||
          c.name.startsWith(`${cleanBase}-`) ||
          c.name.startsWith(`${cleanBase}_`) ||
          c.name === baseContainerName ||
          c.name === serviceName
        );
      }
    });

    matched.sort((a, b) => {
      const numA = parseInt(a.labels?.['com.docker.compose.container-number'] || '1', 10);
      const numB = parseInt(b.labels?.['com.docker.compose.container-number'] || '1', 10);
      if (numA !== numB) return numA - numB;
      return a.name.localeCompare(b.name);
    });

    if (matched.length === 0 && !baseContainerName) {
      throw new Error(`Nenhum container base encontrado para "${serviceName}".`);
    }

    const baseName = baseContainerName || matched[0]?.name;
    const baseDocker = this.docker.getContainer(baseName);
    const baseInspect = await baseDocker.inspect();

    const added: string[] = [];
    const removed: string[] = [];

    if (targetCount > matched.length) {
      let maxNum = 0;
      matched.forEach((c) => {
        let n = parseInt(c.labels?.['com.docker.compose.container-number'] || '0', 10);
        if (!n) {
          const m = c.name.match(/-(\d+)$/);
          if (m) n = parseInt(m[1], 10);
          else n = 1;
        }
        if (n > maxNum) maxNum = n;
      });
      if (maxNum < 1) maxNum = 1;

      const needed = targetCount - matched.length;
      for (let i = 1; i <= needed; i++) {
        const nextNum = maxNum + i;
        const newName = isCompose && project
          ? `${project}-${serviceName}-${nextNum}`
          : `${cleanBase}-${nextNum}`;

        const baseLabels = { ...(baseInspect.Config.Labels || {}) };
        baseLabels['com.docker.compose.container-number'] = String(nextNum);
        baseLabels['com.docker.compose.service'] = serviceName;
        if (isCompose && project) {
          baseLabels['com.docker.compose.project'] = project;
          baseLabels['com.docker.compose.oneoff'] = 'False';
        }
        if (serviceId) {
          baseLabels['com.docker.domain.service-id'] = serviceId;
        }

        const hostConfig: Docker.HostConfig = {
          Binds: baseInspect.HostConfig.Binds,
          RestartPolicy: baseInspect.HostConfig.RestartPolicy,
          Memory: baseInspect.HostConfig.Memory,
          CpuShares: baseInspect.HostConfig.CpuShares,
          NetworkMode: baseInspect.HostConfig.NetworkMode,
        };

        const endpointsConfig: any = {};
        if (baseInspect.NetworkSettings?.Networks) {
          for (const netName of Object.keys(baseInspect.NetworkSettings.Networks)) {
            endpointsConfig[netName] = {};
          }
        }
        if (!endpointsConfig['proxy-net']) {
          endpointsConfig['proxy-net'] = {};
        }

        const newContainer = await this.docker.createContainer({
          name: newName,
          Image: baseInspect.Config.Image,
          Env: baseInspect.Config.Env,
          Cmd: baseInspect.Config.Cmd,
          Entrypoint: baseInspect.Config.Entrypoint,
          WorkingDir: baseInspect.Config.WorkingDir,
          User: baseInspect.Config.User,
          Labels: baseLabels,
          HostConfig: hostConfig,
          NetworkingConfig: {
            EndpointsConfig: endpointsConfig,
          },
        });

        await newContainer.start();
        await this.attachToNetwork(newName);
        added.push(newName);
      }
    } else if (targetCount < matched.length) {
      const toRemoveCount = matched.length - targetCount;
      const surplus = matched.slice(-toRemoveCount).reverse();

      for (const item of surplus) {
        try {
          const c = this.docker.getContainer(item.id || item.name);
          await c.stop({ t: 5 }).catch(() => {});
          await c.remove({ force: true });
          removed.push(item.name);
        } catch (e: any) {
          console.warn(`Erro ao remover réplica ${item.name}:`, e.message);
        }
      }
    }

    const updatedContainers = await this.listContainers();
    const finalReplicas = updatedContainers
      .filter((c) => {
        if (serviceId && c.labels?.['com.docker.domain.service-id'] === serviceId) {
          return true;
        }
        if (isCompose && project) {
          const matchProject =
            c.composeProject?.toLowerCase() === project.toLowerCase() ||
            c.name.startsWith(`${project}-`) ||
            c.name.startsWith(`${project}_`);
          const matchService =
            c.composeService?.toLowerCase() === serviceName.toLowerCase() ||
            c.name.includes(`-${serviceName}-`) ||
            c.name.includes(`_${serviceName}_`) ||
            c.name.endsWith(`-${serviceName}`) ||
            c.name === serviceName;
          return matchProject && matchService;
        } else {
          return (
            c.name === cleanBase ||
            c.name.startsWith(`${cleanBase}-`) ||
            c.name.startsWith(`${cleanBase}_`) ||
            c.name === baseContainerName ||
            c.name === serviceName
          );
        }
      })
      .map((c) => c.name);

    return { added, removed, current: finalReplicas };
  }
}

export const dockerService = new DockerService();
