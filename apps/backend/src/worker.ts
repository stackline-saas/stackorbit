import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import path from 'node:path';
import fs from 'node:fs';
import { simpleGit } from 'simple-git';
import tar from 'tar-fs';
import { config } from './config.js';
import { prisma, logAudit } from './db.js';
import { dockerService } from './services/docker.service.js';
import { traefikService } from './services/traefik.service.js';
import { queueService, type BuildJobData } from './services/queue.service.js';

console.log(`\n==================================================`);
console.log(`⚙️ Docker Domain Manager Background Worker`);
console.log(`🐳 Socket: ${config.dockerSocketPath}`);
console.log(`📦 Redis: ${config.redisUrl}`);
console.log(`==================================================\n`);

// ===================================================================
// 1. DOCKER EVENT STREAM LISTENER
// ===================================================================
async function startDockerEventListener() {
  try {
    const isAlive = await dockerService.docker.ping();
    if (!isAlive) {
      console.warn('⚠️ Docker socket indisponível para o listener de eventos.');
      return;
    }

    console.log('📡 Conectando ao Docker Event Stream...');
    const eventStream = await dockerService.docker.getEvents({
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
          const action = event.Action; // start, stop, die, restart

          let newStatus: string = 'running';
          if (action === 'stop' || action === 'die') {
            newStatus = 'stopped';
          } else if (action === 'restart') {
            newStatus = 'restarting';
          }

          // Check if this container corresponds to a registered service
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
              `🔔 [Docker Event] Container "${containerName}" mudou de status para: ${newStatus.toUpperCase()} (Evento: ${action})`
            );
          }
        }
      } catch (e: any) {
        // Suppress JSON parse errors on partial stream chunks
      }
    });

    eventStream.on('error', (err: any) => {
      console.warn('⚠️ Docker Event Stream desconectado:', err.message);
      // Reconnect after 5 seconds
      setTimeout(startDockerEventListener, 5000);
    });

    eventStream.on('end', () => {
      console.log('Docker Event Stream encerrado. Tentando reconectar...');
      setTimeout(startDockerEventListener, 5000);
    });
  } catch (err: any) {
    console.warn('Falha ao iniciar Docker Event Listener:', err.message);
    setTimeout(startDockerEventListener, 10000);
  }
}

// ===================================================================
// 2. GIT BUILD & DEPLOY JOB PROCESSOR
// ===================================================================
async function processBuildJob(data: BuildJobData): Promise<void> {
  const { serviceId, gitRepoUrl, gitBranch, dockerfilePath, envVars } = data;
  console.log(`\n🔨 Iniciando Build Job para o serviço: ${serviceId}`);

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) {
    console.error(`Serviço ${serviceId} não encontrado.`);
    return;
  }

  // Create build log entry in database
  const buildLogRecord = await prisma.buildLog.create({
    data: {
      serviceId,
      status: 'cloning',
      logs: `Iniciando clonagem do repositório ${gitRepoUrl} (branch: ${gitBranch})...\n`,
    },
  });

  let aggregatedLogs = `[${new Date().toISOString()}] Iniciando build para ${service.name} (${service.containerName})\n`;

  const appendLogs = async (msg: string) => {
    aggregatedLogs += msg;
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
    // 1. Prepare temp directory
    if (fs.existsSync(buildWorkspace)) {
      fs.rmSync(buildWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(buildWorkspace, { recursive: true });

    // 2. Git Clone
    await appendLogs(`[GIT] Clonando ${gitRepoUrl} na branch "${gitBranch}"...\n`);
    const git = simpleGit();
    await git.clone(gitRepoUrl, buildWorkspace, ['--branch', gitBranch, '--depth', '1']);
    await appendLogs(`[GIT] Repositório clonado com sucesso em ${buildWorkspace}.\n`);

    // Get latest commit hash
    const gitInstance = simpleGit(buildWorkspace);
    const commitLog = await gitInstance.log(['-n', '1']);
    const commitHash = commitLog.latest?.hash.slice(0, 7) || 'HEAD';
    await appendLogs(`[GIT] Commit mais recente: ${commitHash} - ${commitLog.latest?.message}\n`);

    // 3. Verify Dockerfile
    const dockerfileRelative = dockerfilePath || 'Dockerfile';
    const dockerfileAbsolute = path.resolve(buildWorkspace, dockerfileRelative);
    if (!fs.existsSync(dockerfileAbsolute)) {
      throw new Error(`Dockerfile não localizado no caminho: ${dockerfileRelative}`);
    }

    await appendLogs(`[DOCKER] Dockerfile validado. Criando arquivo tar para build...\n`);
    await prisma.service.update({
      where: { id: serviceId },
      data: { buildStatus: 'building' },
    });
    await prisma.buildLog.update({
      where: { id: buildLogRecord.id },
      data: { status: 'building', gitCommit: commitHash },
    });

    // 4. Pack workspace into tar stream for docker.buildImage
    const tarStream = tar.pack(buildWorkspace);
    const imageName = `${service.containerName}:latest`;

    await appendLogs(`[DOCKER] Disparando docker.buildImage para a tag "${imageName}"...\n`);

    const buildStream = (await dockerService.docker.buildImage(tarStream as any, {
      t: imageName,
      dockerfile: dockerfileRelative,
    })) as any;

    await new Promise((resolve, reject) => {
      dockerService.docker.modem.followProgress(
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

    await appendLogs(`\n[DOCKER] Imagem "${imageName}" compilada com sucesso!\n`);

    // 5. Deploy / Recreate container
    await appendLogs(`[DEPLOY] Recriando container "${service.containerName}" na rede proxy-net...\n`);
    const containerId = await dockerService.deployContainer({
      containerName: service.containerName,
      image: imageName,
      envVars: envVars || service.envVars || undefined,
      restartPolicy: service.restartPolicy || undefined,
      memoryLimitMb: service.memoryLimitMb || undefined,
      cpuLimit: service.cpuLimit || undefined,
      command: service.command || undefined,
    });

    await appendLogs(`[DEPLOY] Novo container em execução! Container ID: ${containerId.slice(0, 12)}\n`);

    // 6. Update database & Traefik
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
      data: {
        status: 'success',
        finishedAt: new Date(),
      },
    });

    await traefikService.applyConfig(`Worker: Build de ${service.name}`);
    await appendLogs(`[TRAEFIK] Regras do Traefik regeneradas automaticamente.\n`);
    console.log(`✅ Build do serviço "${service.name}" concluído com sucesso!`);
  } catch (err: any) {
    console.error(`❌ Erro no build do serviço ${service.name}:`, err.message);
    await appendLogs(`\n[FATAL ERROR] Falha no processo de build/deploy: ${err.message}\n`);

    await prisma.service.update({
      where: { id: service.id },
      data: { buildStatus: 'failed' },
    });

    await prisma.buildLog.update({
      where: { id: buildLogRecord.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
      },
    });
  } finally {
    // Cleanup temporary workspace
    try {
      if (fs.existsSync(buildWorkspace)) {
        fs.rmSync(buildWorkspace, { recursive: true, force: true });
      }
    } catch {}
  }
}

// Register fallback in-process queue handler
queueService.registerFallbackProcessor(processBuildJob);

// BullMQ Worker setup
let bullWorker: Worker<BuildJobData> | null = null;
try {
  const redisConnection = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times: number) {
      if (times > 3) return null;
      return 2000;
    },
  });

  redisConnection.on('connect', () => {
    console.log('✅ Worker conectado ao Redis BullMQ com sucesso.');
  });

  bullWorker = new Worker<BuildJobData>(
    'build-queue',
    async (job: Job<BuildJobData>) => {
      await processBuildJob(job.data);
    },
    {
      connection: redisConnection,
      concurrency: 2,
    }
  );

  bullWorker.on('completed', (job) => {
    console.log(`[BullMQ] Job ${job.id} finalizado.`);
  });

  bullWorker.on('failed', (job, err) => {
    console.error(`[BullMQ] Job ${job?.id} falhou:`, err.message);
  });
} catch (e: any) {
  console.warn('BullMQ Worker não pode se conectar ao Redis. Modo in-process ativo.');
}

// ===================================================================
// 3. PERIODIC HEALTHCHECK PING (EVERY 30 SECONDS)
// ===================================================================
async function runHealthcheck() {
  try {
    const activeServices = await prisma.service.findMany({
      where: { isActive: true },
    });

    const runningContainers = await dockerService.listContainers();

    for (const service of activeServices) {
      const container = runningContainers.find(
        (c) => c.name === service.containerName || c.id === service.containerId
      );

      const isRunning = container && container.status === 'running';
      const expectedStatus = isRunning ? 'running' : 'stopped';

      if (service.status !== expectedStatus) {
        await prisma.service.update({
          where: { id: service.id },
          data: { status: expectedStatus },
        });
        console.log(
          `🩺 [Healthcheck] Status corrigido para o serviço "${service.name}": ${expectedStatus.toUpperCase()}`
        );
      }
    }
  } catch (err: any) {
    // Healthcheck error non-fatal
  }
}

// Start Loops
startDockerEventListener();
setInterval(runHealthcheck, 30000);
runHealthcheck();

console.log('🚀 Background Worker pronto e aguardando tarefas...');
