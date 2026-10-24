import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma, logAudit } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { dockerHostManager } from '../services/docker-host-manager.js';
import { dockerService } from '../services/docker.service.js';
import { agentGateway } from '../services/agent-gateway.js';

const router = Router();

// 1. Listar todos os Hosts (com filtro opcional de projectId)
router.get('/', requireAuth, async (req, res) => {
  const { projectId } = req.query;

  try {
    const where: any = {};
    if (projectId && typeof projectId === 'string') {
      where.projectId = projectId;
    }

    const hosts = await prisma.dockerHost.findMany({
      where,
      include: {
        project: {
          select: { id: true, name: true, slug: true, type: true },
        },
        _count: {
          select: { services: true },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    const enriched = hosts.map((h) => ({
      id: h.id,
      name: h.name,
      projectId: h.projectId,
      projectName: h.project.name,
      projectType: h.project.type,
      type: h.type,
      status: h.status,
      endpointUrl: h.endpointUrl,
      isDefault: h.isDefault,
      isSwarmManager: h.isSwarmManager,
      swarmNodeId: h.swarmNodeId,
      agentToken: h.agentToken,
      isAgentConnected: agentGateway.isAgentConnected(h.id),
      cpuUsage: h.cpuUsage,
      memUsage: h.memUsage,
      dockerVersion: h.dockerVersion,
      osInfo: h.osInfo,
      containersCount: h.containersCount,
      servicesCount: h._count.services,
      lastPingAt: h.lastPingAt,
      errorMessage: h.errorMessage,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
    }));

    return res.json(enriched);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao listar hosts: ${err.message}` });
  }
});

// 2. Testar Conexão Direta (sem salvar)
router.post('/test-connection', requireAuth, async (req, res) => {
  const { type, endpointUrl, sshKey, tlsCa, tlsCert, tlsKey } = req.body;

  if (!endpointUrl) {
    return res.status(400).json({ error: 'endpointUrl é obrigatório para testar conexão.' });
  }

  try {
    const result = await dockerHostManager.testConnection({
      type: type || 'SSH',
      endpointUrl: endpointUrl.trim(),
      sshKey: sshKey?.trim(),
      tlsCa,
      tlsCert,
      tlsKey,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: `Falha no teste: ${err.message}` });
  }
});

// 3. Obter Detalhes de um Host específico
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const host = await prisma.dockerHost.findUnique({
      where: { id: req.params.id },
      include: {
        project: true,
        services: {
          include: { domains: true },
        },
      },
    });

    if (!host) return res.status(404).json({ error: 'Host não encontrado.' });

    // Mascara chaves privadas na resposta
    const sanitized = {
      ...host,
      sshKey: host.sshKey ? '*** [Chave SSH Configurada] ***' : null,
      tlsKey: host.tlsKey ? '*** [Certificado TLS Configurado] ***' : null,
    };

    return res.json(sanitized);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao obter host: ${err.message}` });
  }
});

// 4. Cadastrar Novo Host
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const {
    name,
    projectId,
    type,
    endpointUrl,
    sshUser,
    sshKey,
    sshPassword,
    tlsCa,
    tlsCert,
    tlsKey,
  } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome do servidor é obrigatório.' });
  if (!projectId) return res.status(400).json({ error: 'projectId é obrigatório.' });

  const hostType = type || 'SSH';
  const finalEndpoint = hostType === 'EDGE_AGENT'
    ? (endpointUrl?.trim() || 'edge://agent')
    : endpointUrl?.trim();

  if (!finalEndpoint) return res.status(400).json({ error: 'endpointUrl é obrigatório.' });

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Projeto associado não encontrado.' });

    let pingResult: any = { success: true };
    let agentToken: string | null = null;

    if (hostType === 'EDGE_AGENT') {
      agentToken = `dd_agent_${crypto.randomBytes(16).toString('hex')}`;
      pingResult = {
        success: false,
        dockerVersion: null,
        osInfo: 'Aguardando conexão do Edge Agent',
        containersCount: 0,
        error: 'Aguardando conexão do agente',
      };
    } else {
      // Testa a conexão antes de persistir
      pingResult = await dockerHostManager.testConnection({
        type: hostType,
        endpointUrl: finalEndpoint,
        sshKey: sshKey?.trim(),
        tlsCa,
        tlsCert,
        tlsKey,
      });
    }

    const host = await prisma.dockerHost.create({
      data: {
        name: name.trim(),
        projectId,
        type: hostType,
        status: hostType === 'EDGE_AGENT' ? 'OFFLINE' : (pingResult.success ? 'ONLINE' : 'ERROR'),
        endpointUrl: finalEndpoint,
        agentToken,
        sshUser: sshUser?.trim() || null,
        sshKey: sshKey?.trim() || null,
        sshPassword: sshPassword?.trim() || null,
        tlsCa: tlsCa?.trim() || null,
        tlsCert: tlsCert?.trim() || null,
        tlsKey: tlsKey?.trim() || null,
        dockerVersion: pingResult.dockerVersion || null,
        osInfo: pingResult.osInfo || null,
        containersCount: pingResult.containersCount || 0,
        lastPingAt: hostType === 'EDGE_AGENT' ? null : new Date(),
        errorMessage: hostType === 'EDGE_AGENT' ? 'Aguardando inicialização do agente' : (pingResult.success ? null : pingResult.error),
        isDefault: false,
      },
      include: { project: true },
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'HOST_CRIADO',
      entityType: 'HOST',
      entityId: host.id,
      details: `Servidor "${host.name}" (${host.type} - ${host.endpointUrl}) adicionado ao projeto "${project.name}".`,
      ipAddress: req.ip,
    });

    return res.status(201).json({
      ...host,
      pingResult,
      sshKey: host.sshKey ? '***' : null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao cadastrar host: ${err.message}` });
  }
});

// 5. Ping / Atualizar Métricas do Host
router.post('/:id/ping', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await dockerHostManager.syncHostMetrics(req.params.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao testar ping: ${err.message}` });
  }
});

// 6. Listar Containers rodando especificamente neste Host
router.get('/:id/containers', requireAuth, async (req, res) => {
  try {
    const containers = await dockerService.listContainers(req.params.id);
    return res.json(containers);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao listar containers do host: ${err.message}` });
  }
});

// 7. Atualizar Host
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { name, endpointUrl, sshKey, sshUser, type } = req.body;

  try {
    const host = await prisma.dockerHost.findUnique({ where: { id: req.params.id } });
    if (!host) return res.status(404).json({ error: 'Host não encontrado.' });

    const updated = await prisma.dockerHost.update({
      where: { id: req.params.id },
      data: {
        name: name ? name.trim() : undefined,
        endpointUrl: endpointUrl ? endpointUrl.trim() : undefined,
        sshUser: sshUser !== undefined ? sshUser?.trim() : undefined,
        sshKey: sshKey && !sshKey.startsWith('***') ? sshKey.trim() : undefined,
        type: type || undefined,
      },
    });

    // Invalida cache de conexão para forçar reconexão
    dockerHostManager.invalidateClient(host.id);

    return res.json({
      ...updated,
      sshKey: updated.sshKey ? '***' : null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao atualizar host: ${err.message}` });
  }
});

// 8. Obter Configurações e Comandos de Instalação do Edge Agent
router.get('/:id/agent-setup', requireAuth, async (req, res) => {
  try {
    const host = await prisma.dockerHost.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    });

    if (!host) return res.status(404).json({ error: 'Host não encontrado.' });

    // Gera token se ainda não possuir
    let token = host.agentToken;
    if (!token) {
      token = `dd_agent_${crypto.randomBytes(16).toString('hex')}`;
      await prisma.dockerHost.update({
        where: { id: host.id },
        data: { agentToken: token },
      });
    }

    const hostHeader = req.headers.host || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto'] === 'https' || req.secure ? 'wss' : 'ws';
    const managerWsUrl = `${proto}://${hostHeader}/ws/agent`;

    const dockerRunCommand = `docker run -d --name dd-agent --restart=always \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -e MANAGER_WS_URL="${managerWsUrl}" \\
  -e AGENT_TOKEN="${token}" \\
  ghcr.io/vcmuniz/agent:latest`;

    const nodeCommand = `npx tsx apps/agent/src/index.ts --manager "${managerWsUrl}" --token "${token}"`;

    return res.json({
      hostId: host.id,
      hostName: host.name,
      agentToken: token,
      managerWsUrl,
      isConnected: agentGateway.isAgentConnected(host.id),
      dockerRunCommand,
      nodeCommand,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao obter setup do agente: ${err.message}` });
  }
});

// 9. Regenerar Token do Edge Agent
router.post('/:id/regenerate-token', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const host = await prisma.dockerHost.findUnique({ where: { id: req.params.id } });
    if (!host) return res.status(404).json({ error: 'Host não encontrado.' });

    const newToken = `dd_agent_${crypto.randomBytes(16).toString('hex')}`;
    const updated = await prisma.dockerHost.update({
      where: { id: host.id },
      data: {
        agentToken: newToken,
        status: 'OFFLINE',
        errorMessage: 'Token regenerado. Aguardando reconexão do agente.',
      },
    });

    dockerHostManager.invalidateClient(host.id);

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'HOST_TOKEN_REGENERADO',
      entityType: 'HOST',
      entityId: host.id,
      details: `Token do Edge Agent "${host.name}" foi regenerado.`,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      agentToken: newToken,
      message: 'Token de agente regenerado com sucesso.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao regenerar token: ${err.message}` });
  }
});

// 10. Excluir Host
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const host = await prisma.dockerHost.findUnique({
      where: { id: req.params.id },
      include: { services: true },
    });

    if (!host) return res.status(404).json({ error: 'Host não encontrado.' });
    if (host.isDefault) {
      return res.status(400).json({ error: 'O servidor principal padrão não pode ser excluído.' });
    }

    if (host.services.length > 0) {
      return res.status(400).json({
        error: `Não é possível excluir o host pois existem ${host.services.length} serviço(s) alocado(s) nele. Remova ou migre os serviços primeiro.`,
      });
    }

    dockerHostManager.invalidateClient(host.id);
    await prisma.dockerHost.delete({ where: { id: req.params.id } });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'HOST_REMOVIDO',
      entityType: 'HOST',
      entityId: req.params.id,
      details: `Servidor "${host.name}" removido.`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: `Servidor "${host.name}" removido com sucesso.` });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao remover host: ${err.message}` });
  }
});

export default router;
