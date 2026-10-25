import { Router } from 'express';
import { dockerService } from '../services/docker.service.js';
import { traefikService } from '../services/traefik.service.js';
import { prisma, logAudit } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();

// 1. List all containers
router.get('/', requireAuth, async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  try {
    let containers = await dockerService.listContainers();
    const status = await dockerService.getStatus();

    if (projectId) {
      // Find containers belonging to this project's services
      const projectServices = await prisma.service.findMany({
        where: { projectId },
        select: { containerName: true },
      });
      const allowedNames = new Set(
        projectServices.map((s: { containerName: string }) => s.containerName.toLowerCase().replace(/^[\/_]/, ''))
      );

      containers = containers.filter((c: any) => {
        const cleanName = c.name.toLowerCase().replace(/^[\/_]/, '');
        return (
          allowedNames.has(cleanName) ||
          projectServices.some((s: { containerName: string }) => cleanName.includes(s.containerName.toLowerCase()))
        );
      });
    }

    return res.json({ containers, status, projectId });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao consultar Docker Engine: ${err.message}` });
  }
});

// 2. Start container
router.post('/:nameOrId/start', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { nameOrId } = req.params;
  try {
    await dockerService.startContainer(nameOrId);

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
    await dockerService.stopContainer(nameOrId);

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
    await dockerService.restartContainer(nameOrId);

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
    const logs = await dockerService.getContainerLogs(nameOrId, tail);
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
