import { Router } from 'express';
import { dockerService } from '../services/docker.service.js';
import { traefikService } from '../services/traefik.service.js';
import { prisma, logAudit } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();

// 1. List all containers
router.get('/', requireAuth, async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const hostId = req.query.hostId as string | undefined;
  try {
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

    const containers = await dockerService.listContainers(resolvedHostId);
    const status = await dockerService.getStatus(resolvedHostId);

    return res.json({ containers, status, projectId, hostId: resolvedHostId });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao consultar Docker Engine: ${err.message}` });
  }
});

// Helper to resolve hostId for actions
async function resolveHostId(req: any): Promise<string | undefined> {
  const hostId = (req.query.hostId as string) || (req.body?.hostId as string);
  if (hostId) return hostId;
  const projectId = (req.query.projectId as string) || (req.body?.projectId as string);
  if (projectId) {
    const projectHost = await prisma.dockerHost.findFirst({
      where: { projectId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    if (projectHost) return projectHost.id;
  }
  return undefined;
}

// 2. Start container
router.post('/:nameOrId/start', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { nameOrId } = req.params;
  try {
    const hostId = await resolveHostId(req);
    await dockerService.startContainer(nameOrId, hostId);

    // Sincroniza Traefik em background
    traefikService.applyConfig(`Container start: ${nameOrId}`).catch((err) => {
      console.warn(`[Containers] Falha ao sincronizar Traefik: ${err.message}`);
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'CONTAINER_START',
      entityType: 'CONTAINER',
      entityId: nameOrId,
      details: `Container "${nameOrId}" iniciado pelo painel.`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: `Container "${nameOrId}" iniciado.` });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao iniciar container: ${err.message}` });
  }
});

// 2b. Stop container
router.post('/:nameOrId/stop', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { nameOrId } = req.params;
  try {
    const hostId = await resolveHostId(req);
    await dockerService.stopContainer(nameOrId, hostId);

    // Sincroniza Traefik em background
    traefikService.applyConfig(`Container stop: ${nameOrId}`).catch((err) => {
      console.warn(`[Containers] Falha ao sincronizar Traefik: ${err.message}`);
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'CONTAINER_STOP',
      entityType: 'CONTAINER',
      entityId: nameOrId,
      details: `Container "${nameOrId}" parado pelo painel.`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: `Container "${nameOrId}" parado.` });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao parar container: ${err.message}` });
  }
});

// 2c. Restart container
router.post('/:nameOrId/restart', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { nameOrId } = req.params;
  try {
    const hostId = await resolveHostId(req);
    await dockerService.restartContainer(nameOrId, hostId);

    // Sincroniza Traefik em background
    traefikService.applyConfig(`Container restart: ${nameOrId}`).catch((err) => {
      console.warn(`[Containers] Falha ao sincronizar Traefik: ${err.message}`);
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'CONTAINER_RESTART',
      entityType: 'CONTAINER',
      entityId: nameOrId,
      details: `Container "${nameOrId}" reiniciado pelo painel.`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: `Container "${nameOrId}" reiniciado.` });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao reiniciar container: ${err.message}` });
  }
});

// 3. Container logs
router.get('/:nameOrId/logs', requireAuth, async (req, res) => {
  const { nameOrId } = req.params;
  const tail = Number(req.query.tail) || 100;
  try {
    const hostId = await resolveHostId(req);
    const logs = await dockerService.getContainerLogs(nameOrId, tail, hostId);
    return res.json({ logs });
  } catch (err: any) {
    return res.status(500).json({ error: `Falha ao obter logs: ${err.message}` });
  }
});

// 4. Exec command in container
router.post('/:nameOrId/exec', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { nameOrId } = req.params;
  const { command, shell } = req.body;
  if (!command) return res.status(400).json({ error: 'Comando obrigatório.' });

  try {
    const result = await dockerService.execCommand(nameOrId, command, shell || '/bin/sh');

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'CONTAINER_EXEC',
      entityType: 'CONTAINER',
      entityId: nameOrId,
      details: `Executado comando "${command.slice(0, 100)}" no container "${nameOrId}". ExitCode: ${result.exitCode}.`,
      ipAddress: req.ip,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro na execução: ${err.message}` });
  }
});

export default router;
