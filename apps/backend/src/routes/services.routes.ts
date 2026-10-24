import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma, logAudit } from '../db.js';
import { dockerService } from '../services/docker.service.js';
import { traefikService } from '../services/traefik.service.js';
import { queueService } from '../services/queue.service.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();
const CONTAINER_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

interface ServiceMetadata {
  composeProject?: string;
  linkedContainers?: string[];
  gitToken?: string;
  buildContext?: string;
  buildArgs?: Record<string, string>;
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
    const where: any = {};
    if (projectId && typeof projectId === 'string') {
      where.projectId = projectId;
    }

    const services = await prisma.service.findMany({
      where,
      include: {
        domains: true,
        project: { select: { id: true, name: true, slug: true, type: true } },
        dockerHost: { select: { id: true, name: true, status: true, type: true } },
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
      return {
        ...svc,
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
  try {
    const allContainers = await dockerService.listContainers();
    const services = await prisma.service.findMany({ select: { id: true, name: true, containerName: true, notes: true } });

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
      include: { domains: true, buildLogsList: { take: 5, orderBy: { startedAt: 'desc' } } },
    });

    if (!service) {
      return res.status(404).json({ error: 'Serviço não encontrado.' });
    }
    const { userNotes, meta } = parseServiceMetadata(service.notes);
    return res.json({ ...service, userNotes, meta });
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

    const allContainers = await dockerService.listContainers();
    const matchedContainers = matchContainersForService(service, allContainers);

    const enriched = matchedContainers.map((c) => ({
      ...c,
      isPrimary: c.name === service.containerName || c.id === service.containerId,
      isOnProxyNet: c.networks ? c.networks.includes('proxy-net') : false,
      isManuallyLinked: linkedList.includes(c.name) || linkedList.includes(c.id),
    }));

    const primary = allContainers.find((c) => c.name === service.containerName || c.id === service.containerId);
    const composeProject = meta.composeProject || primary?.composeProject || null;

    return res.json({
      serviceId: service.id,
      serviceName: service.name,
      primaryContainerName: service.containerName,
      internalPort: service.internalPort,
      composeProject,
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

    const updated = await prisma.service.update({
      where: { id: service.id },
      data: {
        containerName,
        internalPort: port,
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
        // Enqueue initial build
        await queueService.addBuildJob({
          serviceId: service.id,
          gitRepoUrl: service.gitRepoUrl,
          gitBranch: service.gitBranch || 'main',
          dockerfilePath: service.dockerfilePath || 'Dockerfile',
          envVars: service.envVars || undefined,
          triggeredBy: req.user?.name || 'Administrador',
          gitToken: meta.gitToken,
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
      if (updates.gitToken && updates.gitToken.trim()) updatedMeta.gitToken = updates.gitToken.trim();
      else delete updatedMeta.gitToken;
    }
    if (updates.buildContext !== undefined) {
      updatedMeta.buildContext = updates.buildContext ? updates.buildContext.trim() : '.';
    }
    if (updates.notes !== undefined) {
      const incoming = parseServiceMetadata(updates.notes);
      updatedMeta = { ...updatedMeta, ...incoming.meta };
      finalNotes = serializeServiceMetadata(incoming.userNotes, updatedMeta);
    } else if (updates.gitToken !== undefined || updates.buildContext !== undefined) {
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

// 7. Container Controls: Start, Stop, Restart
router.post('/:id/start', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    try {
      await dockerService.startContainer(service.containerName);
    } catch (err: any) {
      if ((err.statusCode === 404 || err.message?.includes('no such container')) && service.image) {
        // If container does not exist yet, deploy it automatically
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

    await prisma.service.update({ where: { id: service.id }, data: { status: 'running' } });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'CONTAINER_START',
      entityType: 'CONTAINER',
      entityId: service.id,
      details: `Container "${service.containerName}" iniciado com sucesso.`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, status: 'running' });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao iniciar container: ${err.message}` });
  }
});

router.post('/:id/stop', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    await dockerService.stopContainer(service.containerName);
    await prisma.service.update({ where: { id: service.id }, data: { status: 'stopped' } });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'CONTAINER_STOP',
      entityType: 'CONTAINER',
      entityId: service.id,
      details: `Container "${service.containerName}" interrompido.`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, status: 'stopped' });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao parar container: ${err.message}` });
  }
});

router.post('/:id/restart', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    await dockerService.restartContainer(service.containerName);
    await prisma.service.update({ where: { id: service.id }, data: { status: 'running' } });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'CONTAINER_RESTART',
      entityType: 'CONTAINER',
      entityId: service.id,
      details: `Container "${service.containerName}" reiniciado com sucesso.`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, status: 'running' });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao reiniciar container: ${err.message}` });
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

    const job = await queueService.addBuildJob({
      serviceId: service.id,
      gitRepoUrl: service.gitRepoUrl,
      gitBranch: service.gitBranch || 'main',
      dockerfilePath: service.dockerfilePath || 'Dockerfile',
      envVars: service.envVars || undefined,
      triggeredBy: req.user?.name || 'Administrador',
      gitToken: meta.gitToken,
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
    const service = await prisma.service.findUnique({ where: { id: req.params.id } });
    if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

    const allContainers = await dockerService.listContainers();
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

    // If there are domains in Load Balancer mode pointing to this service, sync them!
    const domains = await prisma.domain.findMany({ where: { serviceId: service.id } });
    let domainsUpdated = 0;
    for (const dom of domains) {
      if (dom.targetContainer && dom.targetContainer.startsWith('[')) {
        try {
          const targets: Array<{ container: string; port: number }> = JSON.parse(dom.targetContainer);
          const targetPort = dom.targetPort || service.internalPort;
          const updatedTargets = result.current.map((cName) => ({
            container: cName,
            port: targetPort,
          }));
          await prisma.domain.update({
            where: { id: dom.id },
            data: { targetContainer: JSON.stringify(updatedTargets) },
          });
          domainsUpdated++;
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

export default router;
