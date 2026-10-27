import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma, logAudit } from '../db.js';
import { dockerService } from '../services/docker.service.js';
import { dockerHostManager } from '../services/docker-host-manager.js';
import { swarmService } from '../services/swarm.service.js';
import { traefikService } from '../services/traefik.service.js';
import { queueService } from '../services/queue.service.js';
import { resolveGitToken } from '../services/git-token.service.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();
const CONTAINER_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

export interface ServiceMetadata {
  composeProject?: string;
  linkedContainers?: string[];
  gitToken?: string;
  gitProviderId?: string;
  buildContext?: string;
  buildArgs?: Record<string, string>;
  primaryContainer?: string;
  primaryPort?: number;
  instanceEnvs?: Record<string, string>;
  publishedPorts?: Record<string, { hostPort: number; containerPort: number; protocol?: string }>;
  isSite?: boolean;
  siteType?: 'STATIC' | 'PHP' | 'WORDPRESS' | 'ECOMMERCE';
  documentRoot?: string;
  sftpUser?: string;
  sftpPassword?: string;
  sftpPort?: number;
}

export function parseServiceMetadata(notes?: string | null): { userNotes: string; meta: ServiceMetadata } {
  if (!notes) return { userNotes: '', meta: {} };
  const match = notes.match(/<!--dm-meta:([\s\S]*?)-->/);
  if (match) {
    try {
      const meta = JSON.parse(match[1]);
      const userNotes = notes.replace(/<!--dm-meta:[\s\S]*?-->/, '').trim();
      return { userNotes, meta };
    } catch {
      return { userNotes: notes, meta: {} };
    }
  }
  return { userNotes: notes, meta: {} };
}

export function serializeServiceMetadata(userNotes: string, meta: ServiceMetadata): string {
  const metaStr = `<!--dm-meta:${JSON.stringify(meta)}-->`;
  return userNotes.trim() ? `${userNotes.trim()}\n\n${metaStr}` : metaStr;
}

export function matchContainersForService(
  service: { id: string; name: string; containerName: string; containerId?: string | null; notes?: string | null },
  allContainers: any[]
) {
  const { meta } = parseServiceMetadata(service.notes);
  const linkedList = meta.linkedContainers || [];

  const primary = allContainers.find(
    (c) => c.name === service.containerName || c.id === service.containerId
  );
  const composeProjectName = meta.composeProject || primary?.composeProject || null;

  return allContainers.filter((c) => {
    if (c.name === service.containerName || c.id === service.containerId) return true;
    if (linkedList.includes(c.name) || linkedList.includes(c.id)) return true;
    if (service.id && c.labels?.['com.docker.domain.service-id'] === service.id) return true;
    if (composeProjectName && c.composeProject && c.composeProject.toLowerCase() === composeProjectName.toLowerCase()) {
      return true;
    }
    const baseCName = service.containerName.replace(/-\d+$/, '');
    if (
      c.name.startsWith(`${service.containerName}-`) ||
      c.name.startsWith(`${service.containerName}_`) ||
      c.name.startsWith(`${baseCName}-`) ||
      c.name.startsWith(`${baseCName}_`)
    ) {
      return true;
    }
    const sName = service.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cNameClean = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cNameClean.startsWith(sName)) {
      return true;
    }
    return false;
  });
}

// 1. List all services (com filtro opcional de projectId)
router.get('/', requireAuth, async (req, res) => {
  const { projectId } = req.query;

  try {
    // Auto-heal: Garante que nenhum serviço fique invisível vinculando serviços sem projeto ao projeto padrão e ao host padrão
    const defaultProject = (await prisma.project.findFirst({ where: { isDefault: true } })) || (await prisma.project.findFirst());
    const defaultHost = (await prisma.dockerHost.findFirst({ where: { isDefault: true } })) || (await prisma.dockerHost.findFirst());

    if (defaultProject) {
      await prisma.service.updateMany({
        where: { projectId: null },
        data: { projectId: defaultProject.id },
      });
    }

    if (defaultHost) {
      await prisma.service.updateMany({
        where: { dockerHostId: null },
        data: { dockerHostId: defaultHost.id },
      });
    }

    const where: any = {};
    if (projectId && typeof projectId === 'string') {
      if (defaultProject && projectId === defaultProject.id) {
        where.OR = [{ projectId }, { projectId: null }];
      } else {
        where.projectId = projectId;
      }
    }

    const services = await prisma.service.findMany({
      where,
      include: {
        domains: true,
        project: { select: { id: true, name: true, slug: true, type: true } },
        dockerHost: { select: { id: true, name: true, status: true, type: true, isSwarmManager: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let allContainers: any[] = [];
    try {
      allContainers = await dockerService.listContainers();
    } catch {
      // ignore
    }

    const enriched = services.map((svc) => {
      const matched = matchContainersForService(svc, allContainers);
      const { userNotes, meta } = parseServiceMetadata(svc.notes);
      const isSwarm = svc.project?.type === 'SWARM' || Boolean((svc.dockerHost as any)?.isSwarmManager);
      return {
        ...svc,
        isSwarm,
        notes: userNotes,
        meta: {
          ...meta,
          gitToken: meta.gitToken ? `••••••••${meta.gitToken.slice(-4)}` : undefined,
        },
        containerCount: matched.length > 0 ? matched.length : 1,
      };
    });

    return res.json(enriched);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao buscar serviços: ${err.message}` });
  }
});

// Discover all Docker Compose projects on the Docker daemon
router.get('/compose/discover', requireAuth, async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const hostId = req.query.hostId as string | undefined;

  let resolvedHostId = hostId;
  if (!resolvedHostId && projectId) {
    const projectHost = await prisma.dockerHost.findFirst({
      where: { projectId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    if (projectHost) {
      resolvedHostId = projectHost.id;
    }
  }

  try {
    const allContainers = await dockerService.listContainers(resolvedHostId);
    const services = await prisma.service.findMany({
      where: projectId ? { projectId } : undefined,
      select: { id: true, name: true, containerName: true, notes: true },
    });

    // Group containers by composeProject
    const projectMap = new Map<string, typeof allContainers>();
    for (const c of allContainers) {
      if (c.composeProject) {
        if (!projectMap.has(c.composeProject)) {
          projectMap.set(c.composeProject, []);
        }
        projectMap.get(c.composeProject)!.push(c);
      }
    }

    const projects = Array.from(projectMap.entries()).map(([projectName, containers]) => {
      // Check if project is already imported as a Service
      const matchedService = services.find((s) => {
        const { meta } = parseServiceMetadata(s.notes);
        if (meta.composeProject && meta.composeProject.toLowerCase() === projectName.toLowerCase()) return true;
        if (s.name.toLowerCase() === projectName.toLowerCase()) return true;
        return containers.some((c) => c.name === s.containerName);
      });

      const sampleContainer = containers[0];
      const workingDir = sampleContainer?.labels?.['com.docker.compose.project.working_dir'];

      const suggestedWebContainer = containers.find((c) =>
        c.ports && c.ports.some((p: any) => p.privatePort === 80 || p.privatePort === 3000 || p.privatePort === 8080 || p.privatePort === 8000 || p.privatePort === 9000 || p.privatePort === 9001)
      ) || containers[0];

      const suggestedPort = suggestedWebContainer?.ports?.find((p: any) => p.privatePort)?.privatePort || 80;

      return {
        projectName,
        workingDir,
        containersCount: containers.length,
        containers,
        isImported: Boolean(matchedService),
        serviceId: matchedService?.id || null,
        serviceName: matchedService?.name || null,
        suggestedContainerName: suggestedWebContainer?.name || projectName,
        suggestedPort,
      };
    });

    return res.json(projects);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao descobrir projetos Compose: ${err.message}` });
  }
});

// Import an entire Docker Compose stack as a Service
router.post('/compose/import', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { projectName, name, primaryContainerName, internalPort, domainName } = req.body;
  if (!projectName || !primaryContainerName || !internalPort) {
    return res.status(400).json({ error: 'Campos projectName, primaryContainerName e internalPort são obrigatórios.' });
  }

  try {
    const allContainers = await dockerService.listContainers();
    const stackContainers = allContainers.filter(
      (c) => c.composeProject && c.composeProject.toLowerCase() === projectName.toLowerCase()
    );

    const primary = stackContainers.find((c) => c.name === primaryContainerName) || allContainers.find((c) => c.name === primaryContainerName);
    const serviceName = (name || projectName).trim();
    const port = Number(internalPort);

    // Auto-attach all containers of this stack to proxy-net so they can communicate
    for (const c of stackContainers) {
      await dockerService.attachToNetwork(c.name);
    }
    if (primary) {
      await dockerService.attachToNetwork(primary.name);
    }

    const metaNotes = serializeServiceMetadata('', { composeProject: projectName });

    // Check if service already exists with this containerName or name
    let service = await prisma.service.findFirst({
      where: {
        OR: [{ containerName: primaryContainerName }, { name: serviceName }],
      },
      include: { domains: true },
    });

    let finalProjectId = req.body.projectId;
    let finalDockerHostId = req.body.dockerHostId;

    if (!finalProjectId) {
      const defProj = (await prisma.project.findFirst({ where: { isDefault: true } })) || (await prisma.project.findFirst());
      finalProjectId = defProj?.id || null;
    }

    if (!finalDockerHostId && finalProjectId) {
      const hostInProject = await prisma.dockerHost.findFirst({ where: { projectId: finalProjectId } });
      const defHost = hostInProject || (await prisma.dockerHost.findFirst({ where: { isDefault: true } }));
      finalDockerHostId = defHost?.id || null;
    }

    if (service) {
      service = await prisma.service.update({
        where: { id: service.id },
        data: {
          name: serviceName,
          containerName: primaryContainerName,
          internalPort: port,
          image: primary?.image || service.image,
          status: primary?.status || 'running',
          notes: metaNotes,
          projectId: service.projectId || finalProjectId,
          dockerHostId: service.dockerHostId || finalDockerHostId,
        },
        include: { domains: true },
      });
    } else {
      const webhookSecret = crypto.randomBytes(24).toString('hex');
      service = await prisma.service.create({
        data: {
          name: serviceName,
          containerName: primaryContainerName,
          containerId: primary?.id || null,
          internalPort: port,
          image: primary?.image || 'compose-project:latest',
          status: primary?.status || 'running',
          sourceType: 'IMAGE',
          notes: metaNotes,
          webhookSecret,
          projectId: finalProjectId,
          dockerHostId: finalDockerHostId,
        },
        include: { domains: true },
      });
    }

    // If domainName was provided, link it
    if (domainName && domainName.trim()) {
      const cleanDomain = domainName.trim().toLowerCase();
      const existingDomain = await prisma.domain.findUnique({ where: { domainName: cleanDomain } });
      if (!existingDomain) {
        await prisma.domain.create({
          data: {
            domainName: cleanDomain,
            serviceId: service.id,
            isActive: true,
            sslStatus: 'cloudflare_proxied',
          },
        });
      }
    }

    await traefikService.applyConfig(req.user?.name || 'Administrador');

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'SERVICE_CRIADO',
      entityType: 'SERVICE',
      entityId: service.id,
      details: `Projeto Docker Compose "${projectName}" importado como serviço "${service.name}" (${stackContainers.length} containers).`,
      ipAddress: req.ip,
    });

    return res.status(201).json({ success: true, service });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao importar stack Compose: ${err.message}` });
  }
});

// 2. Set default service fallback (Catch-All)
router.post('/default', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { serviceId } = req.body;

  try {
    // Unset current default
    await prisma.service.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });

    let service = null;
    if (serviceId) {
      service = await prisma.service.update({
        where: { id: serviceId },
        data: { isDefault: true },
      });
    }

    await traefikService.applyConfig(req.user?.name || 'Administrador');

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: serviceId ? 'SET_DEFAULT_SERVICE' : 'REMOVE_DEFAULT_SERVICE',
      entityType: 'SERVICE',
      entityId: serviceId || undefined,
      details: serviceId
        ? `Serviço "${service?.name}" definido como fallback padrão (HostRegexp).`
        : 'Fallback padrão desativado.',
      ipAddress: req.ip,
    });

    return res.json({ success: true, service });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao configurar serviço padrão: ${err.message}` });
  }
});

// 3. Get single service
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      include: {
        domains: true,
        project: { select: { id: true, name: true, slug: true, type: true } },
        dockerHost: { select: { id: true, name: true, status: true, type: true, isSwarmManager: true } },
        buildLogsList: { take: 5, orderBy: { startedAt: 'desc' } },
      },
    });

    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado.' });
    }
    const { userNotes, meta } = parseServiceMetadata(service.notes);
    const isSwarm = service.project?.type === 'SWARM' || Boolean((service.dockerHost as any)?.isSwarmManager);
    return res.json({
      ...service,
      isSwarm,
      notes: userNotes,
      userNotes,
      meta,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao obter serviço: ${err.message}` });
  }
});

// Get all containers associated with a Service (Stack)
router.get('/:id/containers', requireAuth, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const { userNotes, meta } = parseServiceMetadata(service.notes);
    const linkedList = meta.linkedContainers || [];

    const allContainers = await dockerService.listContainers(service.dockerHostId);
    const matchedContainers = matchContainersForService(service, allContainers);
    const dockerClient = await dockerService.getClient(service.dockerHostId);

    const enriched = await Promise.all(
      matchedContainers.map(async (c) => {
        let ports = [...(c.ports || [])];
        let detectedPort: number | null = null;

        const existingPrivate = ports.find((p) => p.privatePort);
        if (existingPrivate) {
          detectedPort = existingPrivate.privatePort;
        }

        // Try deeper inspection if no ports exposed: ONLY check ExposedPorts defined in image/compose
        if (!detectedPort && c.id) {
          try {
            const inspect = await dockerClient.getContainer(c.id).inspect();
            if (inspect.Config?.ExposedPorts) {
              for (const ep of Object.keys(inspect.Config.ExposedPorts)) {
                const m = ep.match(/^(\d+)(?:\/(\w+))?$/);
                if (m) {
                  const pNum = Number(m[1]);
                  detectedPort = pNum;
                  if (!ports.some((p) => p.privatePort === pNum)) {
                    ports.push({ privatePort: pNum, type: m[2] || 'tcp' });
                  }
                }
              }
            }
          } catch {}
        }

        return {
          ...c,
          ports,
          detectedPort,
          isPrimary: c.name === (meta.primaryContainer || service.containerName) || c.id === service.containerId,
          isOnProxyNet: c.networks ? c.networks.includes('proxy-net') : false,
          isManuallyLinked: linkedList.includes(c.name) || linkedList.includes(c.id),
        };
      })
    );

    const primary = allContainers.find((c) => c.name === service.containerName || c.id === service.containerId);
    const composeProject = meta.composeProject || primary?.composeProject || null;

    return res.json({
      serviceId: service.id,
      serviceName: service.name,
      primaryContainerName: service.containerName,
      internalPort: service.internalPort,
      composeProject,
      publishedPorts: meta.publishedPorts || {},
      containers: enriched,
      allAvailableContainers: allContainers.map((c) => ({
        id: c.id,
        name: c.name,
        image: c.image,
        status: c.status,
        composeProject: c.composeProject,
        ports: c.ports,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao obter containers do serviço: ${err.message}` });
  }
});

// Link an existing container to this service stack
router.post('/:id/containers/link', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { containerName } = req.body;
  if (!containerName) return res.status(400).json({ error: 'containerName é obrigatório.' });

  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const { userNotes, meta } = parseServiceMetadata(service.notes);
    const linkedList = meta.linkedContainers || [];

    if (!linkedList.includes(containerName)) {
      linkedList.push(containerName);
    }
    meta.linkedContainers = linkedList;

    const updatedNotes = serializeServiceMetadata(userNotes, meta);
    await prisma.service.update({
      where: { id: service.id },
      data: { notes: updatedNotes },
    });

    // Automatically attach to proxy-net
    await dockerService.attachToNetwork(containerName);

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'SERVICE_ATUALIZADO',
      entityType: 'SERVICE',
      entityId: service.id,
      details: `Container "${containerName}" vinculado ao serviço "${service.name}" e conectado à rede proxy-net.`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: `Container "${containerName}" vinculado com sucesso.` });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao vincular container: ${err.message}` });
  }
});

// Unlink a container from this service stack
router.post('/:id/containers/unlink', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { containerName } = req.body;
  if (!containerName) return res.status(400).json({ error: 'containerName é obrigatório.' });

  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    if (service.containerName === containerName) {
      return res.status(400).json({ error: 'Não é possível desvincular o container primário do serviço.' });
    }

    const { userNotes, meta } = parseServiceMetadata(service.notes);
    meta.linkedContainers = (meta.linkedContainers || []).filter((c) => c !== containerName);

    const updatedNotes = serializeServiceMetadata(userNotes, meta);
    await prisma.service.update({
      where: { id: service.id },
      data: { notes: updatedNotes },
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'SERVICE_ATUALIZADO',
      entityType: 'SERVICE',
      entityId: service.id,
      details: `Container "${containerName}" desvinculado do serviço "${service.name}".`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: `Container "${containerName}" desvinculado.` });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao desvincular container: ${err.message}` });
  }
});

// Connect any container in the stack to proxy-net
router.post('/:id/containers/attach-network', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { containerName } = req.body;
  if (!containerName) return res.status(400).json({ error: 'containerName é obrigatório.' });

  try {
    await dockerService.attachToNetwork(containerName);
    return res.json({ success: true, message: `Container "${containerName}" conectado à rede proxy-net.` });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao conectar à rede: ${err.message}` });
  }
});

// Set Primary Entrypoint Container (routes Traefik HTTP traffic to this container)
router.post('/:id/set-primary-container', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { containerName, internalPort } = req.body;
  if (!containerName) return res.status(400).json({ error: 'containerName é obrigatório.' });

  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const port = internalPort ? Number(internalPort) : service.internalPort;

    // Attach to proxy-net
    await dockerService.attachToNetwork(containerName);

    const { userNotes, meta } = parseServiceMetadata(service.notes);
    meta.primaryContainer = containerName;
    meta.primaryPort = port;

    const isCompose = Boolean(
      meta.composeProject ||
      (service.sourceType === 'GITHUB' &&
        (service.dockerfilePath?.includes('compose') ||
          service.dockerfilePath?.endsWith('.yml') ||
          service.dockerfilePath?.endsWith('.yaml')))
    );

    // For compose stacks, keep the base stack containerName (e.g. infopulse) and do not rename the stack to a replica name!
    const rawBase = meta.composeProject || service.name || service.containerName;
    const cleanBase = rawBase.replace(/-(?:frontend|api|worker|web|app)?-\d+$/, '').trim();
    const baseContainerName = isCompose ? (cleanBase || 'infopulse') : containerName;
    const finalNotes = serializeServiceMetadata(userNotes, meta);

    const updated = await prisma.service.update({
      where: { id: service.id },
      data: {
        containerName: baseContainerName,
        internalPort: port,
        notes: finalNotes,
      },
    });

    await traefikService.applyConfig(req.user?.name || 'Administrador');

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'SERVICE_ATUALIZADO',
      entityType: 'SERVICE',
      entityId: service.id,
      details: `Container primário HTTP alterado para "${containerName}" na porta ${port}.`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, service: updated });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao definir container primário: ${err.message}` });
  }
});

// 4. Create new service
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const {
    name,
    containerName,
    internalPort,
    sourceType,
    image,
    gitRepoUrl,
    gitBranch,
    dockerfilePath,
    gitToken,
    gitProviderId,
    buildContext,
    buildArgs,
    triggerInitialBuild,
    envVars,
    notes,
    isDefault,
    restartPolicy,
    memoryLimitMb,
    cpuLimit,
    command,
  } = req.body;

  if (!name || !containerName || !internalPort) {
    return res.status(400).json({ error: 'Campos "name", "containerName" e "internalPort" são obrigatórios.' });
  }

  const port = Number(internalPort);
  if (isNaN(port) || port < 1 || port > 65535) {
    return res.status(400).json({ error: 'A porta interna deve ser um número entre 1 e 65535.' });
  }

  if (!CONTAINER_NAME_REGEX.test(containerName)) {
    return res.status(400).json({
      error: 'Nome do container inválido. Use apenas letras, números, hífen, underline ou ponto.',
    });
  }

  try {
    const existing = await prisma.service.findUnique({
      where: { containerName },
    });
    if (existing) {
      return res.status(409).json({ error: `Já existe um serviço com o containerName "${containerName}".` });
    }

    if (isDefault) {
      await prisma.service.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const { userNotes, meta } = parseServiceMetadata(notes);
    if (gitToken) meta.gitToken = gitToken.trim();
    if (gitProviderId) meta.gitProviderId = gitProviderId;
    if (buildContext) meta.buildContext = buildContext.trim();
    if (buildArgs) meta.buildArgs = buildArgs;
    const finalNotes = serializeServiceMetadata(userNotes, meta);

    const defaultImage = image || (sourceType === 'GITHUB' ? `${containerName}:latest` : 'nginx:alpine');
    const webhookSecret = crypto.randomBytes(24).toString('hex');

    let finalProjectId = req.body.projectId;
    let finalDockerHostId = req.body.dockerHostId;

    if (!finalProjectId) {
      const defProj = (await prisma.project.findFirst({ where: { isDefault: true } })) || (await prisma.project.findFirst());
      finalProjectId = defProj?.id || null;
    }

    if (!finalDockerHostId && finalProjectId) {
      const hostInProject = await prisma.dockerHost.findFirst({ where: { projectId: finalProjectId } });
      const defHost = hostInProject || (await prisma.dockerHost.findFirst({ where: { isDefault: true } }));
      finalDockerHostId = defHost?.id || null;
    }

    const service = await prisma.service.create({
      data: {
        name: name.trim(),
        containerName: containerName.trim(),
        internalPort: port,
        sourceType: sourceType || 'IMAGE',
        image: defaultImage,
        gitRepoUrl: gitRepoUrl?.trim() || null,
        gitBranch: gitBranch?.trim() || 'main',
        dockerfilePath: dockerfilePath?.trim() || 'Dockerfile',
        envVars: envVars || '',
        notes: finalNotes || null,
        isDefault: Boolean(isDefault),
        restartPolicy: restartPolicy || 'unless-stopped',
        memoryLimitMb: memoryLimitMb ? Number(memoryLimitMb) : null,
        cpuLimit: cpuLimit ? Number(cpuLimit) : null,
        command: command || null,
        webhookSecret,
        status: sourceType === 'GITHUB' && triggerInitialBuild !== false ? 'stopped' : 'running',
        buildStatus: sourceType === 'GITHUB' && triggerInitialBuild !== false ? 'cloning' : 'idle',
        projectId: finalProjectId,
        dockerHostId: finalDockerHostId,
      },
      include: {
        domains: true,
        project: { select: { id: true, name: true, slug: true, type: true } },
        dockerHost: { select: { id: true, name: true, status: true, type: true } },
      },
    });

    // Check if container already exists on Docker daemon (e.g. started via docker-compose externally)
    let existingContainerId: string | null = null;
    let existingStatus = 'stopped';
    try {
      const docker = await dockerService.getClient();
      const rawContainers = await docker.listContainers({ all: true });
      const found = rawContainers.find((c) =>
        c.Names?.some((n) => n.replace(/^\//, '') === service.containerName) || c.Id === service.containerName
      );
      if (found) {
        existingContainerId = found.Id;
        existingStatus = found.State === 'running' ? 'running' : 'stopped';
        // Auto-attach container to proxy-net so Traefik can route to it
        await dockerService.attachToNetwork(service.containerName);
      }
    } catch (e: any) {
      console.warn(`Aviso ao inspecionar container existente "${service.containerName}":`, e.message);
    }

    if (existingContainerId) {
      await prisma.service.update({
        where: { id: service.id },
        data: { containerId: existingContainerId, status: existingStatus },
      });
    } else if (service.sourceType === 'IMAGE') {
      try {
        const containerId = await dockerService.deployContainer({
          containerName: service.containerName,
          image: service.image,
          envVars: service.envVars || undefined,
          restartPolicy: service.restartPolicy || undefined,
          memoryLimitMb: service.memoryLimitMb || undefined,
          cpuLimit: service.cpuLimit || undefined,
          command: service.command || undefined,
        });
        await prisma.service.update({
          where: { id: service.id },
          data: { containerId, status: 'running' },
        });
      } catch (dockerErr: any) {
        console.warn(`Aviso ao criar container para ${service.name}:`, dockerErr.message);
      }
    } else if (service.sourceType === 'GITHUB' && service.gitRepoUrl) {
      if (triggerInitialBuild !== false) {
        const finalToken = await resolveGitToken(prisma, {
          gitRepoUrl: service.gitRepoUrl,
          gitProviderId: meta.gitProviderId,
          explicitToken: meta.gitToken,
        });

        // Enqueue initial build
        await queueService.addBuildJob({
          serviceId: service.id,
          gitRepoUrl: service.gitRepoUrl,
          gitBranch: service.gitBranch || 'main',
          dockerfilePath: service.dockerfilePath || 'Dockerfile',
          envVars: service.envVars || undefined,
          triggeredBy: req.user?.name || 'Administrador',
          gitToken: finalToken,
          buildContext: meta.buildContext,
          buildArgs: meta.buildArgs,
        });
      }
    }

    await traefikService.applyConfig(req.user?.name || 'Administrador');

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'SERVICE_CRIADO',
      entityType: 'SERVICE',
      entityId: service.id,
      details: `Serviço "${service.name}" (${service.containerName}) cadastrado na porta ${service.internalPort}.`,
      ipAddress: req.ip,
    });

    return res.status(201).json(service);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao criar serviço: ${err.message}` });
  }
});

// 5. Update service
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado.' });
    }

    if (updates.isDefault) {
      await prisma.service.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    let finalNotes = service.notes;
    const { userNotes, meta } = parseServiceMetadata(service.notes);
    let updatedMeta = { ...meta };
    if (updates.gitToken !== undefined) {
      const trimmed = updates.gitToken.trim();
      // Não sobrescreve o token real se o frontend enviou o valor mascarado (••••••••xxxx ou ********xxxx)
      if (trimmed.startsWith('••••••••') || trimmed.startsWith('********')) {
        // Mantém o token real pré-existente
      } else if (trimmed) {
        updatedMeta.gitToken = trimmed;
      } else {
        delete updatedMeta.gitToken;
      }
    }
    if (updates.gitProviderId !== undefined) {
      if (updates.gitProviderId) {
        updatedMeta.gitProviderId = updates.gitProviderId;
      } else {
        delete updatedMeta.gitProviderId;
      }
    }
    if (updates.buildContext !== undefined) {
      updatedMeta.buildContext = updates.buildContext ? updates.buildContext.trim() : '.';
    }
    if (updates.notes !== undefined) {
      const incoming = parseServiceMetadata(updates.notes);
      updatedMeta = { ...updatedMeta, ...incoming.meta };
      finalNotes = serializeServiceMetadata(incoming.userNotes, updatedMeta);
    } else if (updates.gitToken !== undefined || updates.gitProviderId !== undefined || updates.buildContext !== undefined) {
      finalNotes = serializeServiceMetadata(userNotes, updatedMeta);
    }

    const updated = await prisma.service.update({
      where: { id },
      data: {
        name: updates.name !== undefined ? updates.name.trim() : undefined,
        containerName: updates.containerName !== undefined ? updates.containerName.trim() : undefined,
        internalPort: updates.internalPort !== undefined ? Number(updates.internalPort) : undefined,
        image: updates.image !== undefined ? updates.image.trim() : undefined,
        notes: finalNotes,
        isActive: updates.isActive !== undefined ? Boolean(updates.isActive) : undefined,
        isDefault: updates.isDefault !== undefined ? Boolean(updates.isDefault) : undefined,
        sourceType: updates.sourceType !== undefined ? updates.sourceType : undefined,
        gitRepoUrl: updates.gitRepoUrl !== undefined ? updates.gitRepoUrl.trim() : undefined,
        gitBranch: updates.gitBranch !== undefined ? updates.gitBranch.trim() : undefined,
        dockerfilePath: updates.dockerfilePath !== undefined ? updates.dockerfilePath.trim() : undefined,
        envVars: updates.envVars !== undefined ? updates.envVars : undefined,
        restartPolicy: updates.restartPolicy !== undefined ? updates.restartPolicy : undefined,
        memoryLimitMb: updates.memoryLimitMb !== undefined ? Number(updates.memoryLimitMb) : undefined,
        cpuLimit: updates.cpuLimit !== undefined ? Number(updates.cpuLimit) : undefined,
        command: updates.command !== undefined ? updates.command : undefined,
      },
      include: { domains: true },
    });

    // If envVars or limits updated, update live container if running
    if (updates.envVars !== undefined || updates.restartPolicy !== undefined) {
      if (service.sourceType === 'GITHUB') {
        try {
          await queueService.addBuildJob({
            serviceId: service.id,
            gitRepoUrl: service.gitRepoUrl || '',
            gitBranch: service.gitBranch || 'main',
            dockerfilePath: service.dockerfilePath || 'docker-compose.yml',
            envVars: updated.envVars || undefined,
            triggeredBy: req.user?.name || 'Administrador (Fast Reload Env)',
            fastReloadEnvOnly: true,
          });
        } catch (qErr: any) {
          console.warn('Aviso ao enfileirar fast reload de ambiente:', qErr.message);
        }
      } else {
        try {
          await dockerService.deployContainer({
            containerName: updated.containerName,
            image: updated.image,
            envVars: updated.envVars || undefined,
            restartPolicy: updated.restartPolicy || undefined,
            memoryLimitMb: updated.memoryLimitMb || undefined,
            cpuLimit: updated.cpuLimit || undefined,
            command: updated.command || undefined,
          });
        } catch (deployErr: any) {
          console.warn('Aviso ao atualizar container em execução:', deployErr.message);
        }
      }
    }

    await traefikService.applyConfig(req.user?.name || 'Administrador');

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'SERVICE_ATUALIZADO',
      entityType: 'SERVICE',
      entityId: id,
      details: `Configurações do serviço "${updated.name}" atualizadas.`,
      ipAddress: req.ip,
    });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao atualizar serviço: ${err.message}` });
  }
});

// 6. Delete service
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  try {
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado.' });
    }

    // Attempt to stop and remove container
    try {
      await dockerService.removeContainer(service.containerName, true);
    } catch (e: any) {
      console.warn(`Container ${service.containerName} não pôde ser removido:`, e.message);
    }

    await prisma.service.delete({ where: { id } });
    await traefikService.applyConfig(req.user?.name || 'Administrador');

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'SERVICE_EXCLUIDO',
      entityType: 'SERVICE',
      entityId: id,
      details: `Serviço "${service.name}" (${service.containerName}) excluído e domínios desvinculados no Traefik.`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: `Serviço "${service.name}" removido.` });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao excluir serviço: ${err.message}` });
  }
});

// 7. Container Controls: Start, Stop, Restart (Supports Single Container & Multi-Container Stacks)
router.post('/:id/start', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const allContainers = await dockerService.listContainers(service.dockerHostId);
    const matched = matchContainersForService(service, allContainers);

    if (matched.length > 0) {
      for (const c of matched) {
        const targetName = c.name || c.id;
        if (!targetName) continue;
        try {
          await dockerService.startContainer(targetName, service.dockerHostId);
        } catch (startErr: any) {
          console.warn(`[Services] Falha ao iniciar container individual "${targetName}": ${startErr.message}`);
        }
      }
    } else {
      // Se não encontrou containers existentes, tenta iniciar ou implantar pelo containerName
      try {
        await dockerService.startContainer(service.containerName, service.dockerHostId);
      } catch (err: any) {
        if ((err.statusCode === 404 || err.message?.includes('no such container')) && service.image) {
          const containerId = await dockerService.deployContainer({
            containerName: service.containerName,
            image: service.image,
            envVars: service.envVars || undefined,
            restartPolicy: service.restartPolicy || undefined,
            memoryLimitMb: service.memoryLimitMb || undefined,
            cpuLimit: service.cpuLimit || undefined,
            command: service.command || undefined,
          });
          await prisma.service.update({ where: { id: service.id }, data: { containerId, status: 'running' } });
          return res.json({ success: true, status: 'running' });
        }
        throw err;
      }
    }

    await prisma.service.update({ where: { id: service.id }, data: { status: 'running' } });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'CONTAINER_START',
      entityType: 'CONTAINER',
      entityId: service.id,
      details: `Serviço "${service.name}" iniciado com sucesso.`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, status: 'running' });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao iniciar serviço: ${err.message}` });
  }
});

router.post('/:id/stop', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    // Encontra todos os containers reais associados ao serviço ou compose stack
    const allContainers = await dockerService.listContainers(service.dockerHostId);
    const matched = matchContainersForService(service, allContainers);

    const targetContainers = matched.length > 0
      ? matched
      : [{ name: service.containerName, id: service.containerId }];

    for (const c of targetContainers) {
      const targetName = c.name || c.id;
      if (!targetName) continue;
      try {
        await dockerService.stopContainer(targetName, service.dockerHostId);
      } catch (stopErr: any) {
        console.warn(`[Services] Aviso ao parar container individual "${targetName}": ${stopErr.message}`);
      }
    }

    await prisma.service.update({ where: { id: service.id }, data: { status: 'stopped' } });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'CONTAINER_STOP',
      entityType: 'CONTAINER',
      entityId: service.id,
      details: `Serviço "${service.name}" (${targetContainers.map(c => c.name || c.id).join(', ')}) interrompido.`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, status: 'stopped' });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao parar serviço: ${err.message}` });
  }
});

router.post('/:id/restart', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const allContainers = await dockerService.listContainers(service.dockerHostId);
    const matched = matchContainersForService(service, allContainers);

    const targetContainers = matched.length > 0
      ? matched
      : [{ name: service.containerName, id: service.containerId }];

    for (const c of targetContainers) {
      const targetName = c.name || c.id;
      if (!targetName) continue;
      try {
        await dockerService.restartContainer(targetName, service.dockerHostId);
      } catch (restartErr: any) {
        console.warn(`[Services] Falha ao reiniciar container individual "${targetName}": ${restartErr.message}`);
      }
    }

    await prisma.service.update({ where: { id: service.id }, data: { status: 'running' } });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'CONTAINER_RESTART',
      entityType: 'CONTAINER',
      entityId: service.id,
      details: `Serviço "${service.name}" reiniciado com sucesso.`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, status: 'running' });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao reiniciar serviço: ${err.message}` });
  }
});

// 8. Rebuild Trigger (Git Build & Deploy Job)
const handleRebuild = async (req: AuthenticatedRequest, res: any) => {
  const { id } = req.params;
  try {
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    if (service.sourceType !== 'GITHUB' || !service.gitRepoUrl) {
      return res.status(400).json({ error: 'Este serviço não está configurado para deploy via Git/GitHub.' });
    }

    const { meta } = parseServiceMetadata(service.notes);

    await prisma.service.update({
      where: { id },
      data: { buildStatus: 'cloning' },
    });

    const finalToken = await resolveGitToken(prisma, {
      gitRepoUrl: service.gitRepoUrl,
      gitProviderId: meta.gitProviderId,
      explicitToken: meta.gitToken,
    });

    const job = await queueService.addBuildJob({
      serviceId: service.id,
      gitRepoUrl: service.gitRepoUrl,
      gitBranch: service.gitBranch || 'main',
      dockerfilePath: service.dockerfilePath || 'Dockerfile',
      envVars: service.envVars || undefined,
      triggeredBy: req.user?.name || 'Administrador',
      gitToken: finalToken,
      buildContext: meta.buildContext,
      buildArgs: meta.buildArgs,
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'REBUILD_DISPARADO',
      entityType: 'SERVICE',
      entityId: service.id,
      details: `Rebuild disparado via repositório ${service.gitRepoUrl} (branch: ${service.gitBranch}).`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, jobId: job.id, message: 'Build enfileirado no Worker com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao disparar rebuild: ${err.message}` });
  }
};

router.post('/:id/rebuild', requireAuth, handleRebuild);
router.post('/:id/build', requireAuth, handleRebuild);

// Get build history for service
router.get('/:id/builds', requireAuth, async (req, res) => {
  try {
    const builds = await prisma.buildLog.findMany({
      where: { serviceId: req.params.id },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    return res.json(builds);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao obter histórico de builds: ${err.message}` });
  }
});

// 9. Container Logs & Build Logs
router.get('/:id/logs', requireAuth, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const tail = Number(req.query.tail) || 100;
    const logs = await dockerService.getContainerLogs(service.containerName, tail);
    return res.json({ logs });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao obter logs: ${err.message}` });
  }
});

router.get('/:id/build-logs', requireAuth, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      include: { buildLogsList: { orderBy: { startedAt: 'desc' }, take: 10 } },
    });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    return res.json({
      serviceId: service.id,
      buildStatus: service.buildStatus,
      lastBuiltAt: service.lastBuiltAt,
      buildLogs: service.buildLogs,
      history: service.buildLogsList,
      webhookUrl: `${req.protocol}://${req.get('host')}/api/webhooks/github/${service.id}`,
      webhookSecret: service.webhookSecret,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao obter histórico de builds: ${err.message}` });
  }
});

// 10. SSH & Direct Command Info
router.get('/:id/ssh-info', requireAuth, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const settings = await prisma.appSettings.findFirst({ where: { id: 'default' } });
    const hostIp = settings?.originServerIp || req.hostname || '127.0.0.1';
    const targetContainer = (req.query.container as string) || service.containerName;

    return res.json({
      containerName: targetContainer,
      dockerExecCmd: `docker exec -it ${targetContainer} /bin/sh`,
      sshExecCmd: `ssh root@${hostIp} "docker exec -it ${targetContainer} /bin/sh"`,
      internalPort: service.internalPort,
      network: 'proxy-net',
      status: service.status,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao obter instruções de acesso: ${err.message}` });
  }
});

// 11. Interactive Docker Exec API
router.post('/:id/exec', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { command, shell, containerName } = req.body;
  if (!command) return res.status(400).json({ error: 'O comando a ser executado é obrigatório.' });

  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const targetContainer = containerName || service.containerName;

    const result = await dockerService.execCommand(
      targetContainer,
      command,
      shell || '/bin/sh'
    );

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'CONTAINER_EXEC',
      entityType: 'CONTAINER',
      entityId: service.id,
      details: `Executado comando "${command.slice(0, 100)}" no container "${targetContainer}". ExitCode: ${result.exitCode}.`,
      ipAddress: req.ip,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro na execução do comando: ${err.message}` });
  }
});

// 12. Scale Component Replicas in Stack
router.post('/:id/scale', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { composeService, replicas } = req.body;
  const numReplicas = Number(replicas);

  if (!composeService || isNaN(numReplicas) || numReplicas < 1) {
    return res.status(400).json({ error: 'composeService e quantidade de réplicas válida (>= 1) são obrigatórios.' });
  }

  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id },
      include: {
        project: true,
        dockerHost: true,
      },
    });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const isSwarm = service.project?.type === 'SWARM' || Boolean((service.dockerHost as any)?.isSwarmManager);
    if (isSwarm) {
      await swarmService.scaleSwarmService(
        service.dockerHostId,
        composeService,
        numReplicas
      );

      await logAudit({
        userId: req.user?.id,
        userName: req.user?.name || 'Administrador',
        action: 'SERVICE_SCALE_SWARM',
        entityType: 'SERVICE',
        entityId: service.id,
        details: `Componente Swarm "${composeService}" escalado para ${numReplicas} réplica(s) no cluster Swarm da stack "${service.name}".`,
        ipAddress: req.ip,
      });

      return res.json({
        success: true,
        isSwarm: true,
        composeService,
        replicas: numReplicas,
        added: [],
        removed: [],
        current: [],
      });
    }

    const allContainers = await dockerService.listContainers(service.dockerHostId);
    const matched = matchContainersForService(service, allContainers);
    const primary = matched.find((c) => c.name === service.containerName) || matched[0];
    const project = primary?.composeProject || null;

    const result = await dockerService.scaleServiceComponent(
      project,
      composeService,
      numReplicas,
      primary?.name || service.containerName,
      service.id
    );

    // Persist replicas in service.notes meta.linkedContainers
    const { userNotes, meta } = parseServiceMetadata(service.notes);
    let linkedList = meta.linkedContainers || [];
    for (const addName of result.added) {
      if (!linkedList.includes(addName)) {
        linkedList.push(addName);
      }
    }
    if (result.removed.length > 0) {
      linkedList = linkedList.filter((name) => !result.removed.includes(name));
    }
    meta.linkedContainers = linkedList;
    const updatedNotes = serializeServiceMetadata(userNotes, meta);
    await prisma.service.update({
      where: { id: service.id },
      data: { notes: updatedNotes },
    });

    // If there are domains in Load Balancer mode pointing to this service, sync them preserving other components!
    const domains = await prisma.domain.findMany({ where: { serviceId: service.id } });
    let domainsUpdated = 0;
    for (const dom of domains) {
      if (dom.targetContainer && dom.targetContainer.startsWith('[')) {
        try {
          let targets: Array<{ container: string; port: number }> = JSON.parse(dom.targetContainer);
          const targetPort = dom.targetPort || service.internalPort;

          // Check if this domain targets any containers of this composeService
          const targetsThisComponent = targets.some(
            (t) =>
              result.current.includes(t.container) ||
              result.removed.includes(t.container) ||
              t.container.includes(composeService)
          );

          if (targetsThisComponent) {
            // 1. Remove downscaled replicas
            targets = targets.filter((t) => !result.removed.includes(t.container));

            // 2. Add newly scaled replicas preserving existing containers from other components
            for (const addName of result.added) {
              if (!targets.some((t) => t.container === addName)) {
                targets.push({ container: addName, port: targetPort });
              }
            }

            // 3. Ensure all current replicas of this service are present
            for (const curName of result.current) {
              if (!targets.some((t) => t.container === curName)) {
                targets.push({ container: curName, port: targetPort });
              }
            }

            await prisma.domain.update({
              where: { id: dom.id },
              data: { targetContainer: JSON.stringify(targets) },
            });
            domainsUpdated++;
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    if (domainsUpdated > 0) {
      await traefikService.applyConfig('Escala de Réplicas');
    }

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'SERVICE_SCALE',
      entityType: 'SERVICE',
      entityId: service.id,
      details: `Componente "${composeService}" escalado para ${numReplicas} réplica(s) na stack "${service.name}". [${result.current.join(', ')}].`,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      composeService,
      replicas: numReplicas,
      added: result.added,
      removed: result.removed,
      current: result.current,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao escalar serviço: ${err.message}` });
  }
});

// Helper to parse key-value lines
function parseEnvStringToMap(str?: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!str) return result;
  str.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      result[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  });
  return result;
}

// 13. Obter Variáveis de Ambiente de uma Instância Individual
router.get('/:id/instances/:containerName/env', requireAuth, async (req, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const containerName = req.params.containerName;
    const { meta } = parseServiceMetadata(service.notes);
    const instanceEnvsMap = meta.instanceEnvs || {};
    const instanceEnvStr = instanceEnvsMap[containerName] || '';

    let runningEnvs: Record<string, string> = {};
    try {
      const docker = await dockerHostManager.getClientForHost(service.dockerHostId);
      const inspect = await docker.getContainer(containerName).inspect();
      if (inspect.Config?.Env) {
        inspect.Config.Env.forEach((line: string) => {
          const idx = line.indexOf('=');
          if (idx > 0) {
            runningEnvs[line.slice(0, idx).trim()] = line.slice(idx + 1);
          }
        });
      }
    } catch {}

    const baseEnvStr = service.envVars || '';
    const baseMap = parseEnvStringToMap(baseEnvStr);
    const instanceMap = parseEnvStringToMap(instanceEnvStr);
    const effectiveMap = { ...baseMap, ...instanceMap };

    return res.json({
      containerName,
      baseEnvStr,
      instanceEnvStr,
      baseMap,
      instanceMap,
      effectiveMap,
      runningEnvs,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao obter variáveis da instância: ${err.message}` });
  }
});

// 14. Atualizar Variáveis de Ambiente de uma Instância Individual e Reiniciar
router.put('/:id/instances/:containerName/env', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const containerName = req.params.containerName;
    const { envVars } = req.body;
    if (typeof envVars !== 'string') {
      return res.status(400).json({ error: 'O campo envVars deve ser uma string com formato KEY=VAL.' });
    }

    const { userNotes, meta } = parseServiceMetadata(service.notes);
    meta.instanceEnvs = meta.instanceEnvs || {};
    meta.instanceEnvs[containerName] = envVars.trim();

    const updatedNotes = serializeServiceMetadata(userNotes, meta);
    await prisma.service.update({
      where: { id: service.id },
      data: { notes: updatedNotes },
    });

    const baseMap = parseEnvStringToMap(service.envVars);
    const instanceMap = parseEnvStringToMap(envVars);
    const effectiveMap = { ...baseMap, ...instanceMap };
    const effectiveEnvArray = Object.entries(effectiveMap).map(([k, v]) => `${k}=${v}`);

    let recreatedCount = 0;
    let recreateError: string | null = null;
    try {
      const docker = await dockerHostManager.getClientForHost(service.dockerHostId);
      const allContainers = await docker.listContainers({ all: true });

      // Encontrar todos os containers que pertencem a esta instância/componente
      let targetContainers = allContainers.filter((c: any) => {
        const name = c.Names?.[0]?.replace(/^\//, '');
        const comp = c.Labels?.['com.docker.compose.service'];
        return (
          name === containerName ||
          comp === containerName ||
          name?.startsWith(`${containerName}-`) ||
          name?.startsWith(`${service.containerName}_${containerName}`) ||
          name?.startsWith(`${service.containerName}-${containerName}`)
        );
      });

      if (targetContainers.length === 0) {
        try {
          const single = await docker.getContainer(containerName).inspect();
          if (single) {
            targetContainers = [{ Id: single.Id, Names: ['/' + containerName] } as any];
          }
        } catch {}
      }

      for (const tc of targetContainers) {
        const cName = tc.Names?.[0]?.replace(/^\//, '') || containerName;
        try {
          const oldContainer = docker.getContainer(tc.Id);
          const inspect = await oldContainer.inspect();

          await oldContainer.stop({ t: 5 }).catch(() => {});
          await oldContainer.remove({ force: true }).catch(() => {});

          const endpointsConfig: any = {};
          if (inspect.NetworkSettings?.Networks) {
            for (const netName of Object.keys(inspect.NetworkSettings.Networks)) {
              endpointsConfig[netName] = {};
            }
          }
          if (!endpointsConfig['proxy-net']) {
            endpointsConfig['proxy-net'] = {};
          }

          const hostConfig: any = {
            Binds: inspect.HostConfig.Binds,
            RestartPolicy: inspect.HostConfig.RestartPolicy,
            Memory: inspect.HostConfig.Memory,
            CpuShares: inspect.HostConfig.CpuShares,
            NetworkMode: inspect.HostConfig.NetworkMode,
            PortBindings: inspect.HostConfig.PortBindings,
          };

          const newContainer = await docker.createContainer({
            name: cName,
            Image: inspect.Config.Image,
            Env: effectiveEnvArray,
            Cmd: inspect.Config.Cmd,
            Entrypoint: inspect.Config.Entrypoint,
            WorkingDir: inspect.Config.WorkingDir,
            User: inspect.Config.User,
            Labels: inspect.Config.Labels,
            ExposedPorts: inspect.Config.ExposedPorts,
            HostConfig: hostConfig,
            NetworkingConfig: {
              EndpointsConfig: endpointsConfig,
            },
          });

          await newContainer.start();
          await dockerService.attachToNetwork(cName, service.dockerHostId || undefined);
          recreatedCount++;
        } catch (subErr: any) {
          console.warn(`[InstanceEnv] Falha ao recriar container ${cName}:`, subErr.message);
          recreateError = subErr.message;
        }
      }
    } catch (e: any) {
      console.warn(`[InstanceEnv] Falha geral ao recriar containers:`, e.message);
      recreateError = e.message;
    }

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'INSTANCE_ENV_UPDATE',
      entityType: 'SERVICE',
      entityId: service.id,
      details: `Variáveis da instância "${containerName}" atualizadas na stack "${service.name}". ${recreatedCount > 0 ? `${recreatedCount} container(s) recriado(s) com sucesso.` : `Aviso: ${recreateError}`}`,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      recreated: recreatedCount > 0,
      recreatedCount,
      recreateError,
      containerName,
      effectiveMap,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao salvar variáveis da instância: ${err.message}` });
  }
});

// 15. Publicar / Alterar Porta Host da Instância
router.post('/:id/instances/:componentName/ports', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const componentName = req.params.componentName;
    const { containerPort, hostPort, protocol } = req.body;

    const cPort = Number(containerPort);
    if (!cPort || isNaN(cPort)) {
      return res.status(400).json({ error: 'Porta interna do container é obrigatória.' });
    }

    const proto = (protocol || 'tcp').toLowerCase();
    const portKey = `${cPort}/${proto}`;
    const parsedHostPort = hostPort !== undefined && hostPort !== null && String(hostPort).trim() !== ''
      ? Number(hostPort)
      : null;

    if (parsedHostPort !== null && (isNaN(parsedHostPort) || parsedHostPort < 1 || parsedHostPort > 65535)) {
      return res.status(400).json({ error: 'Porta pública no host inválida (deve estar entre 1 e 65535).' });
    }

    const docker = await dockerHostManager.getClientForHost(service.dockerHostId);
    const allContainers = await docker.listContainers({ all: true });

    // Encontrar containers que pertencem a este componente
    let targetContainers = allContainers.filter((c: any) => {
      const name = c.Names?.[0]?.replace(/^\//, '');
      const comp = c.Labels?.['com.docker.compose.service'];
      return (
        name === componentName ||
        comp === componentName ||
        name?.startsWith(`${componentName}-`) ||
        name?.startsWith(`${service.containerName}_${componentName}`) ||
        name?.startsWith(`${service.containerName}-${componentName}`)
      );
    });

    if (targetContainers.length === 0) {
      try {
        const single = await docker.getContainer(componentName).inspect();
        if (single) {
          targetContainers = [{ Id: single.Id, Names: ['/' + componentName] } as any];
        }
      } catch {}
    }

    if (targetContainers.length === 0) {
      return res.status(404).json({ error: `Nenhum container encontrado para a instância "${componentName}".` });
    }

    const recreatedList: string[] = [];
    for (const tc of targetContainers) {
      const cName = tc.Names?.[0]?.replace(/^\//, '') || componentName;
      try {
        const cObj = docker.getContainer(tc.Id);
        const inspect = await cObj.inspect();

        await cObj.stop({ t: 5 }).catch(() => {});
        await cObj.remove({ force: true }).catch(() => {});

        const currentBindings: any = { ...(inspect.HostConfig?.PortBindings || {}) };
        const exposedPorts: any = { ...(inspect.Config?.ExposedPorts || {}) };
        exposedPorts[portKey] = {};

        if (parsedHostPort) {
          currentBindings[portKey] = [{ HostPort: String(parsedHostPort) }];
        } else {
          delete currentBindings[portKey];
        }

        const endpointsConfig: any = {};
        if (inspect.NetworkSettings?.Networks) {
          for (const netName of Object.keys(inspect.NetworkSettings.Networks)) {
            endpointsConfig[netName] = {};
          }
        }
        if (!endpointsConfig['proxy-net']) {
          endpointsConfig['proxy-net'] = {};
        }

        const newContainer = await docker.createContainer({
          name: cName,
          Image: inspect.Config.Image,
          Env: inspect.Config.Env,
          Cmd: inspect.Config.Cmd,
          Entrypoint: inspect.Config.Entrypoint,
          WorkingDir: inspect.Config.WorkingDir,
          User: inspect.Config.User,
          Labels: inspect.Config.Labels,
          ExposedPorts: exposedPorts,
          HostConfig: {
            ...inspect.HostConfig,
            PortBindings: Object.keys(currentBindings).length > 0 ? currentBindings : undefined,
          },
          NetworkingConfig: {
            EndpointsConfig: endpointsConfig,
          },
        });

        await newContainer.start();
        await dockerService.attachToNetwork(cName, service.dockerHostId || undefined);
        recreatedList.push(cName);
      } catch (recreateErr: any) {
        console.error(`Erro ao atualizar portas do container ${cName}:`, recreateErr);
        if (recreateErr.message?.includes('port is already allocated')) {
          return res.status(400).json({
            error: `A porta host ${parsedHostPort} já está em uso por outro serviço na máquina host.`
          });
        }
        return res.status(500).json({ error: `Falha ao recriar container com nova porta: ${recreateErr.message}` });
      }
    }

    // Salvar nos metadados do serviço
    const { userNotes, meta } = parseServiceMetadata(service.notes);
    meta.publishedPorts = meta.publishedPorts || {};
    if (parsedHostPort) {
      meta.publishedPorts[componentName] = { hostPort: parsedHostPort, containerPort: cPort, protocol: proto };
    } else {
      delete meta.publishedPorts[componentName];
    }
    const updatedNotes = serializeServiceMetadata(userNotes, meta);
    await prisma.service.update({
      where: { id: service.id },
      data: { notes: updatedNotes },
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'INSTANCE_PORT_UPDATE',
      entityType: 'SERVICE',
      entityId: service.id,
      details: parsedHostPort
        ? `Porta pública ${parsedHostPort} ➔ :${cPort}/${proto} mapeada para instância "${componentName}".`
        : `Porta pública removida da instância "${componentName}".`,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      componentName,
      containerPort: cPort,
      hostPort: parsedHostPort,
      recreated: recreatedList,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao configurar portas da instância: ${err.message}` });
  }
});

// 15. Adicionar Nova Instância / Componente ao Agrupamento do Serviço
router.post('/:id/instances', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const { name, image, internalPort, hostPort, publicPort, envVars, command, volumes } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'O nome do container é obrigatório.' });
    }
    if (!image || typeof image !== 'string' || !image.trim()) {
      return res.status(400).json({ error: 'A imagem Docker é obrigatória.' });
    }

    const cleanName = name.trim();
    const cleanImage = image.trim();
    const parsedPort = internalPort ? Number(internalPort) : undefined;
    const parsedHostPort = hostPort || publicPort ? Number(hostPort || publicPort) : undefined;

    const docker = await dockerHostManager.getClientForHost(service.dockerHostId);

    // Checar se já existe container com esse nome
    try {
      const existing = await docker.getContainer(cleanName).inspect();
      if (existing) {
        return res.status(400).json({ error: `Já existe um container com o nome "${cleanName}".` });
      }
    } catch {}

    // Pull image if not local
    try {
      const images = await docker.listImages();
      const hasImage = images.some((img: any) =>
        img.RepoTags?.some((t: string) => t === cleanImage || t === `${cleanImage}:latest`)
      );
      if (!hasImage) {
        console.log(`🐳 Baixando imagem "${cleanImage}" para nova instância...`);
        const stream = await docker.pull(cleanImage);
        await new Promise((resolve, reject) => {
          docker.modem.followProgress(stream, (err: any, res: any) => (err ? reject(err) : resolve(res)));
        });
      }
    } catch (pullErr: any) {
      console.warn(`[AddInstance] Aviso no pull da imagem: ${pullErr.message}`);
    }

    const baseMap = parseEnvStringToMap(service.envVars);
    const instanceMap = envVars ? parseEnvStringToMap(envVars) : {};
    const effectiveMap = { ...baseMap, ...instanceMap };
    const effectiveEnvArray = Object.entries(effectiveMap).map(([k, v]) => `${k}=${v}`);

    const labels: Record<string, string> = {
      'com.docker.domain.service-id': service.id,
      'com.docker.compose.service': cleanName,
      'com.docker.compose.project': service.containerName,
    };

    let binds: string[] = [];
    if (volumes && typeof volumes === 'string') {
      binds = volumes.split('\n').map((v) => v.trim()).filter(Boolean);
    }

    const exposedPorts: any = {};
    const portBindings: any = {};
    if (parsedPort) {
      exposedPorts[`${parsedPort}/tcp`] = {};
      if (parsedHostPort) {
        portBindings[`${parsedPort}/tcp`] = [{ HostPort: String(parsedHostPort) }];
      }
    }

    const container = await docker.createContainer({
      name: cleanName,
      Image: cleanImage,
      Env: effectiveEnvArray,
      Cmd: command ? command.split(' ') : undefined,
      Labels: labels,
      ExposedPorts: Object.keys(exposedPorts).length > 0 ? exposedPorts : undefined,
      HostConfig: {
        RestartPolicy: { Name: 'unless-stopped' },
        Binds: binds.length > 0 ? binds : undefined,
        PortBindings: Object.keys(portBindings).length > 0 ? portBindings : undefined,
      },
      NetworkingConfig: {
        EndpointsConfig: {
          'proxy-net': {},
        },
      },
    });

    await container.start();
    await dockerService.attachToNetwork(cleanName, service.dockerHostId || undefined);

    // Update metadata: linkedContainers, instanceEnvs, publishedPorts
    const { userNotes, meta } = parseServiceMetadata(service.notes);
    meta.linkedContainers = meta.linkedContainers || [];
    if (!meta.linkedContainers.includes(cleanName)) {
      meta.linkedContainers.push(cleanName);
    }
    if (envVars && envVars.trim()) {
      meta.instanceEnvs = meta.instanceEnvs || {};
      meta.instanceEnvs[cleanName] = envVars.trim();
    }
    if (parsedHostPort && parsedPort) {
      meta.publishedPorts = meta.publishedPorts || {};
      meta.publishedPorts[cleanName] = { hostPort: parsedHostPort, containerPort: parsedPort, protocol: 'tcp' };
    }

    const updatedNotes = serializeServiceMetadata(userNotes, meta);
    await prisma.service.update({
      where: { id: service.id },
      data: { notes: updatedNotes },
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'INSTANCE_CREATED',
      entityType: 'SERVICE',
      entityId: service.id,
      details: `Nova instância "${cleanName}" (${cleanImage}) adicionada à stack "${service.name}".${parsedHostPort ? ` Porta host ${parsedHostPort} ➔ :${parsedPort}` : ''}`,
      ipAddress: req.ip,
    });

    return res.status(201).json({
      success: true,
      containerName: cleanName,
      image: cleanImage,
      internalPort: parsedPort,
      hostPort: parsedHostPort,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao adicionar nova instância: ${err.message}` });
  }
});

export default router;
