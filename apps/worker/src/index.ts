import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import path from 'node:path';
import fs from 'node:fs';
import { simpleGit } from 'simple-git';
import tar from 'tar-fs';
import dotenv from 'dotenv';
import Docker from 'dockerode';
import { prisma, logAudit } from '@docker-domain/database';
import { createDockerClient } from './services/docker-connection.js';
import { traefikService } from './services/traefik.service.js';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || 'proxy-net';

console.log(`\n==================================================`);
console.log(`⚙️ Docker Domain Manager Dedicated Background Worker`);
console.log(`📦 Redis Queue: ${REDIS_URL}`);
console.log(`🌐 Network: ${DOCKER_NETWORK}`);
console.log(`==================================================\n`);

let docker: Docker;

export interface BuildJobData {
  serviceId: string;
  gitRepoUrl: string;
  gitBranch: string;
  dockerfilePath: string;
  envVars?: string;
  triggeredBy?: string;
  gitToken?: string;
  buildContext?: string;
  buildArgs?: Record<string, string>;
}

// -----------------------------------------------------------------------------
// 1. DOCKER EVENT STREAM LISTENER
// -----------------------------------------------------------------------------
async function startDockerEventListener() {
  try {
    const isAlive = await docker.ping();
    if (!isAlive) {
      console.warn('⚠️ Docker socket indisponível para o listener de eventos.');
      return;
    }

    console.log('📡 [Worker] Conectando ao Docker Event Stream...');
    const eventStream = await docker.getEvents({
      filters: { type: ['container'], event: ['start', 'stop', 'die', 'restart'] },
    });

    eventStream.on('data', async (chunk: Buffer) => {
      try {
        const lines = chunk.toString('utf-8').trim().split('\n');
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line);
          const rawName = event.Actor?.Attributes?.name || '';
          const containerName = rawName.replace(/^\//, '');
          const action = event.Action;

          let newStatus = 'running';
          if (action === 'stop' || action === 'die') {
            newStatus = 'stopped';
          } else if (action === 'restart') {
            newStatus = 'restarting';
          }

          const service = await prisma.service.findUnique({
            where: { containerName },
          });

          if (service && service.status !== newStatus) {
            await prisma.service.update({
              where: { id: service.id },
              data: {
                status: newStatus,
                containerId: event.id || service.containerId,
              },
            });
            console.log(
              `🔔 [Docker Event] Container "${containerName}" atualizado para: ${newStatus.toUpperCase()} (${action})`
            );
          }
        }
      } catch (e: any) {}
    });

    eventStream.on('error', (err: any) => {
      console.warn('⚠️ Docker Event Stream desconectado:', err.message);
      setTimeout(startDockerEventListener, 5000);
    });

    eventStream.on('end', () => {
      console.log('Docker Event Stream finalizado. Reconectando...');
      setTimeout(startDockerEventListener, 5000);
    });
  } catch (err: any) {
    console.warn('Falha no listener de eventos do Docker:', err.message);
    setTimeout(startDockerEventListener, 10000);
  }
}

// -----------------------------------------------------------------------------
// 2. HELPER: DEPLOY CONTAINER
// -----------------------------------------------------------------------------
async function deployContainer(options: {
  containerName: string;
  image: string;
  envVars?: string;
  restartPolicy?: string;
  memoryLimitMb?: number;
  cpuLimit?: number;
  command?: string;
}): Promise<string> {
  // Ensure network exists
  try {
    const networks = await docker.listNetworks();
    if (!networks.some((n) => n.Name === DOCKER_NETWORK)) {
      await docker.createNetwork({ Name: DOCKER_NETWORK, Driver: 'bridge' });
    }
  } catch (e: any) {}

  // Remove existing container
  try {
    const oldContainer = docker.getContainer(options.containerName);
    await oldContainer.remove({ force: true });
  } catch (e: any) {}

  // Parse env vars
  const envArray: string[] = [];
  if (options.envVars) {
    options.envVars
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))
      .forEach((line) => envArray.push(line));
  }

  const restartPolicy = options.restartPolicy || 'unless-stopped';
  const hostConfig: Docker.HostConfig = {
    NetworkMode: DOCKER_NETWORK,
    RestartPolicy: { Name: restartPolicy as any },
  };

  if (options.memoryLimitMb && options.memoryLimitMb > 0) {
    hostConfig.Memory = options.memoryLimitMb * 1024 * 1024;
  }
  if (options.cpuLimit && options.cpuLimit > 0) {
    hostConfig.NanoCpus = Math.floor(options.cpuLimit * 1e9);
  }

  const container = await docker.createContainer({
    name: options.containerName,
    Image: options.image,
    Env: envArray,
    HostConfig: hostConfig,
    Cmd: options.command ? options.command.split(' ') : undefined,
  });

  await container.start();
  return container.id;
}

// -----------------------------------------------------------------------------
// 3. GIT BUILD & DEPLOY JOB PROCESSOR
// -----------------------------------------------------------------------------
async function processBuildJob(data: BuildJobData): Promise<void> {
  const { serviceId, gitRepoUrl, gitBranch, dockerfilePath, envVars, gitToken, buildContext, buildArgs } = data;
  console.log(`\n🔨 [Worker] Processando build para o serviço: ${serviceId}`);

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) {
    console.error(`Serviço ${serviceId} não encontrado no PostgreSQL.`);
    return;
  }

  // Check if token was provided in data or stored in service metadata notes
  let token = gitToken;
  if (!token && service.notes) {
    try {
      const match = service.notes.match(/<!--dm-meta:(.*?)-->/);
      if (match) {
        const meta = JSON.parse(match[1]);
        if (meta.gitToken) token = meta.gitToken;
      }
    } catch {}
  }

  const buildLogRecord = await prisma.buildLog.create({
    data: {
      serviceId,
      status: 'cloning',
      logs: `Iniciando clonagem de ${gitRepoUrl} (${gitBranch})...\n`,
    },
  });

  let aggregatedLogs = `[${new Date().toISOString()}] Iniciando build para ${service.name} (${service.containerName})\n`;

  const sanitize = (str: string): string => {
    if (!token) return str;
    return str.replaceAll(token, '******');
  };

  const appendLogs = async (msg: string) => {
    aggregatedLogs += sanitize(msg);
    try {
      await prisma.buildLog.update({
        where: { id: buildLogRecord.id },
        data: { logs: aggregatedLogs },
      });
      await prisma.service.update({
        where: { id: serviceId },
        data: { buildLogs: aggregatedLogs },
      });
    } catch {}
  };

  const buildWorkspace = path.resolve(process.cwd(), 'temp', 'builds', service.id);

  try {
    if (fs.existsSync(buildWorkspace)) {
      fs.rmSync(buildWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(buildWorkspace, { recursive: true });

    // 1. Git Clone (with private token support if available)
    let cloneUrl = gitRepoUrl;
    if (token && cloneUrl.startsWith('https://')) {
      cloneUrl = cloneUrl.replace('https://', `https://x-access-token:${token}@`);
    }

    await appendLogs(`[GIT] Clonando ${gitRepoUrl} (branch: ${gitBranch})...\n`);
    const git = simpleGit();
    await git.clone(cloneUrl, buildWorkspace, ['--branch', gitBranch, '--depth', '1']);
    await appendLogs(`[GIT] Repositório clonado com sucesso.\n`);

    const gitInstance = simpleGit(buildWorkspace);
    const commitLog = await gitInstance.log(['-n', '1']);
    const commitHash = commitLog.latest?.hash.slice(0, 7) || 'HEAD';
    const commitMsg = commitLog.latest?.message || '';
    const commitAuthor = commitLog.latest?.author_name || '';
    await appendLogs(`[GIT] Commit: ${commitHash} por ${commitAuthor} - ${commitMsg}\n`);

    // 2. Validate Dockerfile
    const contextRel = buildContext?.trim() || '.';
    const contextDir = path.resolve(buildWorkspace, contextRel);
    const dockerfileRelative = dockerfilePath || 'Dockerfile';
    const dockerfileAbsolute = path.resolve(contextDir, dockerfileRelative);

    if (!fs.existsSync(dockerfileAbsolute)) {
      throw new Error(`Dockerfile não encontrado em "${dockerfileRelative}" no contexto "${contextRel}".`);
    }

    await appendLogs(`[DOCKER] Dockerfile validado. Criando stream tar...\n`);
    await prisma.service.update({ where: { id: serviceId }, data: { buildStatus: 'building' } });
    await prisma.buildLog.update({
      where: { id: buildLogRecord.id },
      data: { status: 'building', gitCommit: `${commitHash} - ${commitMsg.slice(0, 40)}` },
    });

    // 3. Build Image
    const tarStream = tar.pack(contextDir);
    const imageName = `${service.containerName}:latest`;

    await appendLogs(`[DOCKER] Executando docker.buildImage para ${imageName}...\n`);

    const buildOptions: any = {
      t: imageName,
      dockerfile: dockerfileRelative,
    };
    if (buildArgs && Object.keys(buildArgs).length > 0) {
      buildOptions.buildargs = buildArgs;
    }

    const buildStream = (await docker.buildImage(tarStream as any, buildOptions)) as any;

    await new Promise((resolve, reject) => {
      docker.modem.followProgress(
        buildStream,
        (err: any, res: any) => {
          if (err) return reject(err);
          resolve(res);
        },
        async (event: any) => {
          if (event.stream) {
            process.stdout.write(event.stream);
            await appendLogs(event.stream);
          } else if (event.error) {
            await appendLogs(`[DOCKER ERROR] ${event.error}\n`);
          }
        }
      );
    });

    await appendLogs(`\n[DOCKER] Imagem "${imageName}" construída com sucesso!\n`);

    // 4. Deploy Container
    await appendLogs(`[DEPLOY] Recriando container "${service.containerName}" na rede ${DOCKER_NETWORK}...\n`);
    const containerId = await deployContainer({
      containerName: service.containerName,
      image: imageName,
      envVars: envVars || service.envVars || undefined,
      restartPolicy: service.restartPolicy || undefined,
      memoryLimitMb: service.memoryLimitMb || undefined,
      cpuLimit: service.cpuLimit || undefined,
      command: service.command || undefined,
    });

    await appendLogs(`[DEPLOY] Container em execução: ${containerId.slice(0, 12)}\n`);

    // 5. Update DB & Traefik
    await prisma.service.update({
      where: { id: service.id },
      data: {
        containerId,
        status: 'running',
        buildStatus: 'success',
        lastBuiltAt: new Date(),
      },
    });

    await prisma.buildLog.update({
      where: { id: buildLogRecord.id },
      data: { status: 'success', finishedAt: new Date() },
    });

    await traefikService.applyConfig(`Worker: Build de ${service.name}`);
    await appendLogs(`[TRAEFIK] dynamic_conf.yml atualizado com sucesso.\n`);
    console.log(`✅ [Worker] Build do serviço "${service.name}" concluído com sucesso!`);
  } catch (err: any) {
    console.error(`❌ [Worker] Falha no build de ${service.name}:`, err.message);
    await appendLogs(`\n[FATAL ERROR] Falha no build/deploy: ${err.message}\n`);

    await prisma.service.update({ where: { id: service.id }, data: { buildStatus: 'failed' } });
    await prisma.buildLog.update({ where: { id: buildLogRecord.id }, data: { status: 'failed', finishedAt: new Date() } });
  } finally {
    try {
      if (fs.existsSync(buildWorkspace)) {
        fs.rmSync(buildWorkspace, { recursive: true, force: true });
      }
    } catch {}
  }
}

// -----------------------------------------------------------------------------
// 4. PERIODIC HEALTHCHECK
// -----------------------------------------------------------------------------
async function runHealthcheck() {
  try {
    const activeServices = await prisma.service.findMany({ where: { isActive: true } });
    const rawContainers = await docker.listContainers({ all: true });

    for (const service of activeServices) {
      const container = rawContainers.find(
        (c) =>
          c.Names?.some((n) => n.replace(/^\//, '') === service.containerName) ||
          c.Id === service.containerId
      );

      const isRunning = container && container.State === 'running';
      const expectedStatus = isRunning ? 'running' : 'stopped';

      if (service.status !== expectedStatus) {
        await prisma.service.update({
          where: { id: service.id },
          data: { status: expectedStatus },
        });
        console.log(
          `🩺 [Healthcheck] Status ajustado para "${service.name}": ${expectedStatus.toUpperCase()}`
        );
      }
    }
  } catch (e: any) {}
}

// -----------------------------------------------------------------------------
// 5. BOOTSTRAP
// -----------------------------------------------------------------------------
async function bootstrap() {
  docker = await createDockerClient();

  // Wait for database schema readiness
  let dbReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      await prisma.service.count();
      dbReady = true;
      break;
    } catch {
      console.log('⏳ [Worker] Aguardando inicialização do schema no PostgreSQL...');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!dbReady) {
    throw new Error('Banco de dados indisponível após 60 segundos.');
  }

  // BullMQ Worker setup
  try {
    const redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times: number) {
        if (times > 3) return null;
        return 2000;
      },
    });

    const bullWorker = new Worker<BuildJobData>(
      'build-queue',
      async (job: Job<BuildJobData>) => {
        await processBuildJob(job.data);
      },
      {
        connection: redis,
        concurrency: 2,
      }
    );

    bullWorker.on('completed', (job) => console.log(`[BullMQ] Job ${job.id} concluído.`));
    bullWorker.on('failed', (job, err) => console.error(`[BullMQ] Job ${job?.id} falhou:`, err.message));
  } catch (err: any) {
    console.warn('⚠️ BullMQ Worker em modo standalone:', err.message);
  }

  startDockerEventListener();
  setInterval(runHealthcheck, 30000);
  runHealthcheck();

  console.log('🚀 Worker inicializado e pronto para processamento.');
}

bootstrap().catch((err) => {
  console.error('Falha crítica ao iniciar Worker:', err);
  process.exit(1);
});
