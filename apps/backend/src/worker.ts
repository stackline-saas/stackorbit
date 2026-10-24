import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
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
  const { serviceId, gitRepoUrl, gitBranch, dockerfilePath, envVars, gitToken, buildContext, buildArgs } = data;
  console.log(`\n🔨 Iniciando Build Job para o serviço: ${serviceId}`);

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) {
    console.error(`Serviço ${serviceId} não encontrado.`);
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

  // Create build log entry in database
  const buildLogRecord = await prisma.buildLog.create({
    data: {
      serviceId,
      status: 'cloning',
      logs: `Iniciando clonagem do repositório ${gitRepoUrl} (branch: ${gitBranch})...\n`,
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
  let isCompose = false;

  try {
    // 1. Prepare temp directory
    if (fs.existsSync(buildWorkspace)) {
      fs.rmSync(buildWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(buildWorkspace, { recursive: true });

    // 2. Git Clone (with private token support if available)
    let cloneUrl = gitRepoUrl;
    if (token && cloneUrl.startsWith('https://')) {
      cloneUrl = cloneUrl.replace('https://', `https://x-access-token:${token}@`);
    }

    await appendLogs(`[GIT] Clonando repositório na branch "${gitBranch}"...\n`);
    const git = simpleGit();
    await git.clone(cloneUrl, buildWorkspace, ['--branch', gitBranch, '--depth', '1']);
    await appendLogs(`[GIT] Repositório clonado com sucesso.\n`);

    // Get latest commit hash and author
    const gitInstance = simpleGit(buildWorkspace);
    const commitLog = await gitInstance.log(['-n', '1']);
    const commitHash = commitLog.latest?.hash.slice(0, 7) || 'HEAD';
    const commitMsg = commitLog.latest?.message || '';
    const commitAuthor = commitLog.latest?.author_name || '';
    await appendLogs(`[GIT] Commit: ${commitHash} por ${commitAuthor} - ${commitMsg}\n`);

    // 3. Check definition type: Docker Compose vs single Dockerfile
    isCompose = Boolean(
      dockerfilePath &&
        (dockerfilePath.endsWith('.yml') ||
          dockerfilePath.endsWith('.yaml') ||
          dockerfilePath.toLowerCase().includes('compose'))
    );

    const contextRel = buildContext?.trim() || '.';
    const contextDir = path.resolve(buildWorkspace, contextRel);

    if (isCompose) {
      // -------------------------------------------------------------
      // DOCKER COMPOSE BUILD & UP
      // -------------------------------------------------------------
      let composeFileRel = dockerfilePath || 'docker-compose.yml';
      let composeFileAbs = path.resolve(buildWorkspace, composeFileRel);

      if (!fs.existsSync(composeFileAbs)) {
        const candidates = [
          path.resolve(contextDir, composeFileRel),
          path.resolve(buildWorkspace, 'docker-compose.yml'),
          path.resolve(buildWorkspace, 'docker-compose.yaml'),
          path.resolve(buildWorkspace, 'compose.yml'),
          path.resolve(buildWorkspace, 'compose.yaml'),
          path.resolve(buildWorkspace, 'infra', 'docker-compose.yml'),
          path.resolve(buildWorkspace, 'infra', 'docker-compose.yaml'),
        ];
        const found = candidates.find((c) => fs.existsSync(c));
        if (found) {
          composeFileAbs = found;
          composeFileRel = path.relative(buildWorkspace, found);
        } else {
          throw new Error(
            `Arquivo Docker Compose não localizado em "${composeFileRel}". Verifique a estrutura do repositório.`
          );
        }
      }

      const composeDir = path.dirname(composeFileAbs);
      const projectName = service.containerName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

      await appendLogs(`[COMPOSE] Docker Compose localizado em "${composeFileRel}". Iniciando stack...\n`);
      await prisma.service.update({
        where: { id: serviceId },
        data: { buildStatus: 'building' },
      });
      await prisma.buildLog.update({
        where: { id: buildLogRecord.id },
        data: { status: 'building', gitCommit: `${commitHash} - ${commitMsg.slice(0, 40)}` },
      });

      // Write .env if envVars exist
      const activeEnv = envVars || service.envVars;
      if (activeEnv && activeEnv.trim().length > 0) {
        try {
          const envPath = path.resolve(composeDir, '.env');
          fs.writeFileSync(envPath, activeEnv.trim() + '\n', 'utf-8');
          await appendLogs(`[COMPOSE] Variáveis de ambiente gravadas em .env\n`);
        } catch (e: any) {
          await appendLogs(`[COMPOSE] Aviso ao gravar arquivo .env: ${e.message}\n`);
        }
      }

      await appendLogs(`[COMPOSE] Executando: docker compose -p ${projectName} -f ${composeFileAbs} up -d --build --remove-orphans\n`);

      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          'docker',
          ['compose', '-p', projectName, '-f', composeFileAbs, 'up', '-d', '--build', '--remove-orphans'],
          {
            cwd: composeDir,
            env: {
              ...process.env,
            },
          }
        );

        child.stdout.on('data', async (chunk) => {
          const text = chunk.toString();
          process.stdout.write(text);
          await appendLogs(text);
        });

        child.stderr.on('data', async (chunk) => {
          const text = chunk.toString();
          process.stderr.write(text);
          await appendLogs(text);
        });

        child.on('error', (err) => {
          reject(new Error(`Falha ao executar docker compose: ${err.message}`));
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`docker compose up encerrou com código de erro ${code}`));
          }
        });
      });

      await appendLogs(`\n[COMPOSE] Stack Docker Compose "${projectName}" compilada e em execução!\n`);

      // Discover stack containers
      const allContainers = await dockerService.docker.listContainers({ all: true });
      const stackContainers = allContainers.filter((c) => {
        const pLabel = c.Labels?.['com.docker.compose.project'];
        const cNames = c.Names?.map((n) => n.replace(/^\//, '')) || [];
        return (
          pLabel?.toLowerCase() === projectName.toLowerCase() ||
          cNames.some((n) => n.startsWith(`${projectName}-`) || n.startsWith(`${projectName}_`))
        );
      });

      if (stackContainers.length === 0) {
        await appendLogs(`[AVISO] Nenhum container associado ao projeto "${projectName}" foi detectado.\n`);
      } else {
        await appendLogs(`[COMPOSE] ${stackContainers.length} container(s) detectado(s) na stack.\n`);
      }

      // Determine primary container for routing
      let primary = stackContainers.find((c) => {
        const cService = c.Labels?.['com.docker.compose.service'];
        const cNames = c.Names?.map((n) => n.replace(/^\//, '')) || [];
        return cService === service.containerName || cNames.includes(service.containerName);
      });

      if (!primary) {
        primary = stackContainers.find((c) => {
          const cService = (c.Labels?.['com.docker.compose.service'] || '').toLowerCase();
          return ['web', 'app', 'api', 'frontend', 'server', 'ui', 'client'].some((k) =>
            cService.includes(k)
          );
        });
      }

      if (!primary && stackContainers.length > 0) {
        primary = stackContainers.find((c) => c.State === 'running') || stackContainers[0];
      }

      // Connect all stack containers to proxy-net and configure aliases
      for (const c of stackContainers) {
        const isPrimary = primary && primary.Id === c.Id;
        const composeService = c.Labels?.['com.docker.compose.service'];
        const displayName = c.Names?.[0]?.replace(/^\//, '') || c.Id.slice(0, 12);
        const aliases: string[] = [];
        if (composeService) aliases.push(composeService);
        if (isPrimary && !aliases.includes(service.containerName)) {
          aliases.push(service.containerName);
        }

        await dockerService.attachToNetwork(c.Id, config.networkName, aliases);
        await appendLogs(
          `[COMPOSE] Container "${displayName}" conectado à rede ${config.networkName} (aliases: ${aliases.join(', ') || 'padrão'}).\n`
        );
      }

      const primaryContainerId = primary ? primary.Id : undefined;
      const linkedNames = stackContainers.map((c) => c.Names?.[0]?.replace(/^\//, '') || c.Id.slice(0, 12));

      // Update service metadata notes
      let updatedNotes = service.notes || '';
      try {
        let metaObj: any = {};
        const match = updatedNotes.match(/<!--dm-meta:(.*?)-->/);
        if (match) {
          metaObj = JSON.parse(match[1]);
          updatedNotes = updatedNotes.replace(/<!--dm-meta:.*?-->/, '').trim();
        }
        metaObj.composeProject = projectName;
        metaObj.definitionType = 'compose';
        metaObj.composeFile = composeFileRel;
        metaObj.linkedContainers = linkedNames;
        if (primary) {
          metaObj.primaryContainer = primary.Names?.[0]?.replace(/^\//, '') || primary.Id.slice(0, 12);
        }
        updatedNotes = (updatedNotes ? updatedNotes + '\n' : '') + `<!--dm-meta:${JSON.stringify(metaObj)}-->`;
      } catch {}

      await prisma.service.update({
        where: { id: service.id },
        data: {
          containerId: primaryContainerId || service.containerId,
          status: 'running',
          buildStatus: 'success',
          lastBuiltAt: new Date(),
          notes: updatedNotes,
        },
      });

      await prisma.buildLog.update({
        where: { id: buildLogRecord.id },
        data: {
          status: 'success',
          finishedAt: new Date(),
        },
      });

      await traefikService.applyConfig(`Worker: Build Compose de ${service.name}`);
      await appendLogs(`[TRAEFIK] Roteamento Traefik sincronizado com sucesso.\n`);
      console.log(`✅ Build Docker Compose do serviço "${service.name}" concluído com sucesso!`);
    } else {
      // -------------------------------------------------------------
      // INDIVIDUAL DOCKERFILE BUILD & DEPLOY
      // -------------------------------------------------------------
      const dockerfileRelative = dockerfilePath || 'Dockerfile';
      const dockerfileAbsolute = path.resolve(contextDir, dockerfileRelative);

      if (!fs.existsSync(dockerfileAbsolute)) {
        throw new Error(`Dockerfile não localizado em "${dockerfileRelative}" no contexto "${contextRel}".`);
      }

      await appendLogs(`[DOCKER] Dockerfile validado em "${dockerfileRelative}". Preparando build...\n`);
      await prisma.service.update({
        where: { id: serviceId },
        data: { buildStatus: 'building' },
      });
      await prisma.buildLog.update({
        where: { id: buildLogRecord.id },
        data: { status: 'building', gitCommit: `${commitHash} - ${commitMsg.slice(0, 40)}` },
      });

      // Pack workspace into tar stream for docker.buildImage
      const tarStream = tar.pack(contextDir);
      const imageName = `${service.containerName}:latest`;

      await appendLogs(`[DOCKER] Compilando imagem Docker "${imageName}"...\n`);

      const buildOptions: any = {
        t: imageName,
        dockerfile: dockerfileRelative,
      };
      if (buildArgs && Object.keys(buildArgs).length > 0) {
        buildOptions.buildargs = buildArgs;
      }

      const buildStream = (await dockerService.docker.buildImage(tarStream as any, buildOptions)) as any;

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

      // Deploy / Recreate container
      await appendLogs(`[DEPLOY] Recriando container "${service.containerName}" na rede ${config.networkName}...\n`);
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

      // Update database & Traefik
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
      await appendLogs(`[TRAEFIK] Roteamento Traefik sincronizado com sucesso.\n`);
      console.log(`✅ Build do serviço "${service.name}" concluído com sucesso!`);
    }
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
    // Cleanup temporary workspace (keep directory for Compose stacks so compose down/re-deploy works)
    try {
      if (fs.existsSync(buildWorkspace) && !isCompose) {
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
