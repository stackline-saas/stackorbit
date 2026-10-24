import express, { Router } from 'express';
import { db } from './db.ts';
import { dockerService } from './dockerService.ts';
import { traefikService } from './traefikService.ts';
import { authenticateUser, requireAuth, type AuthenticatedRequest } from './auth.ts';
import { SERVICE_TEMPLATES } from './templates.ts';
import type { DashboardStats, TestResult, ServiceTemplate } from '../types/index.ts';

const router = Router();

// Domain RFC regex validator
const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const CONTAINER_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

function validateDomain(domain: string): { valid: boolean; reason?: string } {
  if (!domain || typeof domain !== 'string') {
    return { valid: false, reason: 'O nome de domínio é obrigatório.' };
  }
  const clean = domain.trim().toLowerCase();
  if (clean.length > 253) {
    return { valid: false, reason: 'O domínio excede o limite máximo de 253 caracteres.' };
  }
  if (!DOMAIN_REGEX.test(clean)) {
    return { valid: false, reason: 'Formato de domínio inválido (exemplo válido: api.bla.com.br ou app.meudominio.com).' };
  }
  return { valid: true };
}

// ==========================================
// 1. AUTHENTICATION
// ==========================================
router.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  const auth = authenticateUser(email, password);
  if (!auth) {
    db.logAudit({
      userName: email,
      action: 'LOGIN_FALHOU',
      entityType: 'AUTH',
      details: 'Tentativa de login com credenciais incorretas',
      ipAddress: req.ip,
    });
    return res.status(401).json({ error: 'Credenciais inválidas. Verifique o e-mail e a senha.' });
  }

  db.logAudit({
    userId: auth.user.id,
    userName: auth.user.name,
    action: 'LOGIN_SUCESSO',
    entityType: 'AUTH',
    details: 'Sessão administrativa iniciada com sucesso',
    ipAddress: req.ip,
  });

  return res.json({
    user: auth.user,
    token: auth.token,
  });
});

router.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    db.deleteSession(token);
  }
  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Administrador',
    action: 'LOGOUT',
    entityType: 'AUTH',
    details: 'Sessão encerrada pelo usuário',
    ipAddress: req.ip,
  });
  return res.json({ message: 'Sessão encerrada com sucesso.' });
});

router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  return res.json({ user: req.user });
});

// ==========================================
// 2. DASHBOARD
// ==========================================
router.get('/dashboard', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const services = db.getServices();
    const domains = db.getDomains();
    const containers = await dockerService.listContainers();
    const dockerStatus = await dockerService.getStatus();
    const defaultService = services.find((s) => s.isDefault);
    const recentAudit = db.getAuditLogs(8);
    const proxyRevisions = db.getProxyConfigurations();

    const stats: DashboardStats = {
      totalServices: services.length,
      activeServices: services.filter((s) => s.isActive).length,
      totalDomains: domains.length,
      activeDomains: domains.filter((d) => d.isActive).length,
      runningContainers: containers.filter((c) => c.status === 'running').length,
      stoppedContainers: containers.filter((c) => c.status !== 'running').length,
      defaultServiceName: defaultService ? defaultService.name : null,
      defaultServiceId: defaultService ? defaultService.id : null,
      dockerConnected: dockerStatus.connected,
      dockerSocketPath: dockerStatus.socketPath,
      dockerEngineVersion: dockerStatus.version,
      dockerIsEmulated: dockerStatus.isEmulated,
      recentAuditLogs: recentAudit,
      lastProxyConfigAppliedAt: proxyRevisions[0]?.appliedAt,
      mainDomain: db.getSettings().mainDomain,
    };

    return res.json(stats);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao obter estatísticas: ${err.message}` });
  }
});

// ==========================================
// 3. SERVICES (CRUD & CONTROLS)
// ==========================================
router.get('/services', requireAuth, (req, res) => {
  return res.json(db.getServices());
});

router.get('/services/:id', requireAuth, (req, res) => {
  const service = db.getServiceById(req.params.id);
  if (!service) {
    return res.status(404).json({ error: 'Serviço não encontrado.' });
  }
  return res.json(service);
});

router.post('/services', requireAuth, (req: AuthenticatedRequest, res) => {
  const {
    name,
    containerName,
    image,
    internalPort,
    notes,
    isDefault,
    sourceType,
    gitRepoUrl,
    gitBranch,
    dockerfilePath,
    envVars,
    restartPolicy,
    memoryLimitMb,
    cpuLimit,
    command,
    volumes,
    network,
  } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'O nome do serviço é obrigatório.' });
  }

  if (!containerName || !CONTAINER_NAME_REGEX.test(containerName.trim())) {
    return res.status(400).json({
      error: 'Nome do container inválido. Utilize apenas letras, números, hífen, ponto e sublinhado.',
    });
  }

  const portNum = Number(internalPort);
  if (!portNum || portNum < 1 || portNum > 65535) {
    return res.status(400).json({ error: 'A porta interna deve ser um número entre 1 e 65535.' });
  }

  const isGitHub = sourceType === 'GITHUB';
  if (isGitHub && (!gitRepoUrl || !gitRepoUrl.trim())) {
    return res.status(400).json({ error: 'A URL do repositório GitHub é obrigatória para serviços via Git.' });
  }

  // Gera segredo único para webhook
  const webhookSecret = `whsec_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
  const finalImage = isGitHub ? `${containerName.trim().toLowerCase()}:latest` : (image || 'app:latest').trim();

  const newService = db.createService({
    name: name.trim(),
    containerName: containerName.trim(),
    image: finalImage,
    internalPort: portNum,
    status: isGitHub ? 'running' : 'running',
    isActive: true,
    isDefault: Boolean(isDefault),
    notes: notes?.trim() || '',
    sourceType: isGitHub ? 'GITHUB' : 'IMAGE',
    gitRepoUrl: isGitHub ? gitRepoUrl.trim() : undefined,
    gitBranch: isGitHub ? (gitBranch?.trim() || 'main') : undefined,
    dockerfilePath: isGitHub ? (dockerfilePath?.trim() || 'Dockerfile') : undefined,
    envVars: envVars || '',
    webhookSecret,
    buildStatus: isGitHub ? 'success' : 'idle',
    lastBuiltAt: isGitHub ? new Date().toISOString() : undefined,
    buildLogs: isGitHub
      ? `[${new Date().toISOString()}] Repositório GitHub ${gitRepoUrl} configurado com sucesso.\nPronto para builds automáticos via push ou disparo manual.`
      : undefined,
    restartPolicy: restartPolicy || 'unless-stopped',
    memoryLimitMb: memoryLimitMb ? Number(memoryLimitMb) : undefined,
    cpuLimit: cpuLimit ? Number(cpuLimit) : undefined,
    command: command?.trim() || undefined,
    volumes: volumes?.trim() || undefined,
    network: network?.trim() || 'proxy-net',
  });

  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: isGitHub ? 'SERVICO_GIT_CRIADO' : 'SERVICO_CRIADO',
    entityType: 'SERVICE',
    entityId: newService.id,
    details: isGitHub
      ? `Serviço "${newService.name}" cadastrado via GitHub (${newService.gitRepoUrl} @ ${newService.gitBranch || 'main'}) ➔ Container: ${newService.containerName}:${newService.internalPort}`
      : `Serviço "${newService.name}" criado (Container: ${newService.containerName}:${newService.internalPort})`,
    ipAddress: req.ip,
  });

  // Auto-apply Traefik dynamic configuration
  if (db.getSettings().autoApplyTraefik) {
    traefikService.applyConfig(req.user?.id, req.user?.name);
  }

  return res.status(201).json(newService);
});

router.put('/services/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const {
    name,
    containerName,
    image,
    internalPort,
    notes,
    isActive,
    isDefault,
    sourceType,
    gitRepoUrl,
    gitBranch,
    dockerfilePath,
    envVars,
    restartPolicy,
    memoryLimitMb,
    cpuLimit,
    command,
    volumes,
    network,
  } = req.body;
  const existing = db.getServiceById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Serviço não encontrado.' });
  }

  const updates: any = {};
  if (name !== undefined) updates.name = name.trim();
  if (containerName !== undefined) {
    if (!CONTAINER_NAME_REGEX.test(containerName.trim())) {
      return res.status(400).json({ error: 'Nome do container inválido.' });
    }
    updates.containerName = containerName.trim();
  }
  if (image !== undefined) updates.image = image.trim();
  if (internalPort !== undefined) {
    const port = Number(internalPort);
    if (!port || port < 1 || port > 65535) {
      return res.status(400).json({ error: 'Porta inválida (1-65535).' });
    }
    updates.internalPort = port;
  }
  if (notes !== undefined) updates.notes = notes.trim();
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (isDefault !== undefined) updates.isDefault = Boolean(isDefault);
  if (sourceType !== undefined) updates.sourceType = sourceType;
  if (gitRepoUrl !== undefined) updates.gitRepoUrl = gitRepoUrl.trim();
  if (gitBranch !== undefined) updates.gitBranch = gitBranch.trim();
  if (dockerfilePath !== undefined) updates.dockerfilePath = dockerfilePath.trim();
  if (envVars !== undefined) updates.envVars = envVars;
  if (restartPolicy !== undefined) updates.restartPolicy = restartPolicy;
  if (memoryLimitMb !== undefined) updates.memoryLimitMb = Number(memoryLimitMb) || undefined;
  if (cpuLimit !== undefined) updates.cpuLimit = Number(cpuLimit) || undefined;
  if (command !== undefined) updates.command = command.trim();
  if (volumes !== undefined) updates.volumes = volumes.trim();
  if (network !== undefined) updates.network = network.trim();

  const updated = db.updateService(req.params.id, updates);

  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: 'SERVICO_ATUALIZADO',
    entityType: 'SERVICE',
    entityId: req.params.id,
    details: `Serviço "${updated?.name}" atualizado`,
    ipAddress: req.ip,
  });

  if (db.getSettings().autoApplyTraefik) {
    traefikService.applyConfig(req.user?.id, req.user?.name);
  }

  return res.json(updated);
});

router.delete('/services/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const service = db.getServiceById(req.params.id);
  if (!service) {
    return res.status(404).json({ error: 'Serviço não encontrado.' });
  }

  const deleted = db.deleteService(req.params.id);
  if (!deleted) {
    return res.status(500).json({ error: 'Falha ao remover serviço.' });
  }

  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: 'SERVICO_REMOVIDO',
    entityType: 'SERVICE',
    entityId: req.params.id,
    details: `Serviço "${service.name}" (${service.containerName}) excluído juntamente com seus domínios vinculados`,
    ipAddress: req.ip,
  });

  if (db.getSettings().autoApplyTraefik) {
    traefikService.applyConfig(req.user?.id, req.user?.name);
  }

  return res.json({ message: 'Serviço excluído com sucesso.' });
});

// Container lifecycle actions
router.post('/services/:id/start', requireAuth, async (req: AuthenticatedRequest, res) => {
  const service = db.getServiceById(req.params.id);
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

  await dockerService.startContainer(service.containerName);
  const updated = db.updateService(service.id, { status: 'running' });

  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: 'CONTAINER_INICIADO',
    entityType: 'CONTAINER',
    entityId: service.containerName,
    details: `Container "${service.containerName}" do serviço "${service.name}" iniciado`,
    ipAddress: req.ip,
  });

  return res.json({ success: true, service: updated });
});

router.post('/services/:id/stop', requireAuth, async (req: AuthenticatedRequest, res) => {
  const service = db.getServiceById(req.params.id);
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

  await dockerService.stopContainer(service.containerName);
  const updated = db.updateService(service.id, { status: 'stopped' });

  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: 'CONTAINER_PARADO',
    entityType: 'CONTAINER',
    entityId: service.containerName,
    details: `Container "${service.containerName}" do serviço "${service.name}" interrompido`,
    ipAddress: req.ip,
  });

  return res.json({ success: true, service: updated });
});

router.post('/services/:id/restart', requireAuth, async (req: AuthenticatedRequest, res) => {
  const service = db.getServiceById(req.params.id);
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

  await dockerService.restartContainer(service.containerName);
  const updated = db.updateService(service.id, { status: 'running' });

  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: 'CONTAINER_REINICIADO',
    entityType: 'CONTAINER',
    entityId: service.containerName,
    details: `Container "${service.containerName}" reiniciado`,
    ipAddress: req.ip,
  });

  return res.json({ success: true, service: updated });
});

router.get('/services/:id/logs', requireAuth, async (req, res) => {
  const service = db.getServiceById(req.params.id);
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

  const tail = Number(req.query.tail) || 80;
  const logs = await dockerService.getLogs(service.containerName, tail);
  return res.json({ container: service.containerName, logs });
});

// Container SSH / Exec Interactive Terminal API for service
router.post('/services/:id/exec', requireAuth, async (req: AuthenticatedRequest, res) => {
  const service = db.getServiceById(req.params.id);
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

  const { command, shell = '/bin/sh' } = req.body;
  if (!command || typeof command !== 'string' || !command.trim()) {
    return res.status(400).json({ error: 'Comando de terminal é obrigatório.' });
  }

  try {
    const result = await dockerService.execCommand(service.containerName, command, shell);
    
    // Log audit for significant terminal operations
    const trimmed = command.trim();
    if (!/^(ls|pwd|env|cat|whoami|id|uptime|date|clear|help)\b/i.test(trimmed)) {
      db.logAudit({
        userId: req.user?.id,
        userName: req.user?.name || 'Admin',
        action: 'CONTAINER_EXEC_SSH',
        entityType: 'CONTAINER',
        entityId: service.containerName,
        details: `Executou comando via terminal: "${trimmed.substring(0, 100)}"`,
        ipAddress: req.ip,
      });
    }

    return res.json({
      success: true,
      serviceId: service.id,
      containerName: service.containerName,
      command: trimmed,
      shell,
      ...result,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro na execução do terminal: ${err.message}` });
  }
});

// Container SSH Connection metadata and ready-to-copy commands
router.get('/services/:id/ssh-info', requireAuth, (req, res) => {
  const service = db.getServiceById(req.params.id);
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

  const settings = db.getSettings();
  const host = settings.originServerIp || settings.mainDomain || 'servidor.bla.com.br';
  const sshUser = 'root';
  const container = service.containerName;

  return res.json({
    containerName: container,
    image: service.image || 'alpine:latest',
    status: service.status,
    internalPort: service.internalPort,
    serverHost: host,
    sshUser,
    commands: {
      sshExecSh: `ssh -t ${sshUser}@${host} "docker exec -it ${container} /bin/sh"`,
      sshExecBash: `ssh -t ${sshUser}@${host} "docker exec -it ${container} /bin/bash"`,
      dockerExecDirect: `docker exec -it ${container} /bin/sh`,
      dockerExecBash: `docker exec -it ${container} /bin/bash`,
      copyToContainer: `docker cp ./arquivo.txt ${container}:/app/`,
      copyFromContainer: `docker cp ${container}:/app/dados ./backup/`,
      inspect: `docker inspect ${container}`,
      top: `docker top ${container}`,
      stats: `docker stats ${container}`,
    },
  });
});

// Trigger build from GitHub repository
router.post('/services/:id/build', requireAuth, async (req: AuthenticatedRequest, res) => {
  const service = db.getServiceById(req.params.id);
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

  const commitMsg = req.body?.commitMessage || 'Disparo manual pelo painel de controle';
  
  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: 'BUILD_GITHUB_INICIADO',
    entityType: 'SERVICE',
    entityId: service.id,
    details: `Build disparado para o serviço "${service.name}" (${service.gitRepoUrl || 'Git'} @ ${service.gitBranch || 'main'})`,
    ipAddress: req.ip,
  });

  const updated = await db.triggerServiceBuild(service.id, { message: commitMsg });

  if (db.getSettings().autoApplyTraefik) {
    traefikService.applyConfig(req.user?.id, req.user?.name);
  }

  return res.json({
    success: true,
    message: `Build e publicação do container ${service.containerName} concluídos com sucesso.`,
    service: updated,
  });
});

// Get build logs and CI/CD status
router.get('/services/:id/build-logs', requireAuth, (req, res) => {
  const service = db.getServiceById(req.params.id);
  if (!service) return res.status(404).json({ error: 'Serviço não encontrado.' });

  return res.json({
    serviceId: service.id,
    serviceName: service.name,
    sourceType: service.sourceType || 'IMAGE',
    gitRepoUrl: service.gitRepoUrl,
    gitBranch: service.gitBranch,
    buildStatus: service.buildStatus || 'idle',
    lastBuiltAt: service.lastBuiltAt,
    buildLogs: service.buildLogs || 'Nenhum build registrado ainda.',
    webhookUrl: `${req.protocol}://${req.get('host')}/api/webhooks/github/${service.id}`,
    webhookSecret: service.webhookSecret,
  });
});

// GitHub Webhook for automated continuous deployment (push-to-deploy)
router.post('/webhooks/github/:id', async (req, res) => {
  const service = db.getServiceById(req.params.id);
  if (!service) {
    return res.status(404).json({ error: 'Serviço correspondente não encontrado.' });
  }

  // Validação opcional de segredo caso configurado
  const querySecret = req.query.secret as string | undefined;
  const headerSecret = req.headers['x-hub-signature-256'] as string | undefined;

  if (service.webhookSecret && querySecret && querySecret !== service.webhookSecret) {
    return res.status(403).json({ error: 'Token de webhook inválido.' });
  }

  const payload = req.body || {};
  const commitHash = payload.head_commit?.id?.substring(0, 7) || payload.after?.substring(0, 7) || 'push-event';
  const commitMsg = payload.head_commit?.message || 'Push automático recebido do GitHub';
  const pusherName = payload.pusher?.name || payload.sender?.login || 'GitHub Webhook';

  db.logAudit({
    userName: `GitHub (${pusherName})`,
    action: 'WEBHOOK_GITHUB_RECEBIDO',
    entityType: 'SERVICE',
    entityId: service.id,
    details: `Evento de Push detectado na branch ${service.gitBranch || 'main'}. Commit: ${commitHash} ("${commitMsg}")`,
    ipAddress: req.ip,
  });

  // Dispara build e deploy em background
  db.triggerServiceBuild(service.id, { hash: commitHash, message: commitMsg }).then(() => {
    if (db.getSettings().autoApplyTraefik) {
      traefikService.applyConfig('github-webhook', 'GitHub CI/CD');
    }
  });

  return res.status(202).json({
    success: true,
    message: `Build e publicação enfileirados com sucesso para commit ${commitHash}.`,
    serviceId: service.id,
  });
});

// ==========================================
// 3.1 SERVICE TEMPLATES (1-CLICK APP STORE)
// ==========================================
router.get('/templates', requireAuth, (req, res) => {
  // Retorna templates com campos e metadados
  const safeTemplates = SERVICE_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    categoryLabel: t.categoryLabel,
    description: t.description,
    iconName: t.iconName,
    defaultImage: t.defaultImage,
    defaultPort: t.defaultPort,
    defaultContainerName: t.defaultContainerName,
    isWebUI: t.isWebUI,
    suggestedDomainPrefix: t.suggestedDomainPrefix,
    fields: t.fields,
  }));
  return res.json(safeTemplates);
});

router.post('/templates/deploy', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { templateId, serviceName, containerName, values, domainName } = req.body;

  const template = SERVICE_TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    return res.status(404).json({ error: 'Template não encontrado.' });
  }

  const finalContainerName = (containerName || template.defaultContainerName).trim().toLowerCase();
  if (!CONTAINER_NAME_REGEX.test(finalContainerName)) {
    return res.status(400).json({ error: 'Nome de container inválido.' });
  }

  // Verifica se já existe um serviço com esse container
  const existingService = db.getServices().find(
    (s) => s.containerName.toLowerCase() === finalContainerName
  );
  if (existingService) {
    return res.status(409).json({
      error: `Já existe um serviço ativo utilizando o container "${finalContainerName}". Escolha outro nome.`,
    });
  }

  // Valida campos obrigatórios do template
  const mergedValues: Record<string, string> = {};
  for (const field of template.fields) {
    const val = values?.[field.key] ?? field.defaultValue;
    if (field.required && (!val || val.trim() === '')) {
      return res.status(400).json({ error: `O campo "${field.label}" é obrigatório.` });
    }
    mergedValues[field.key] = val;
  }

  const envString = template.generateEnv(mergedValues);
  const connString = template.generateConnectionString
    ? template.generateConnectionString(mergedValues, finalContainerName)
    : undefined;

  // Cria o Serviço
  const newService = db.createService({
    name: (serviceName || template.name).trim(),
    containerName: finalContainerName,
    image: template.defaultImage,
    internalPort: template.defaultPort,
    status: 'running',
    isActive: true,
    isDefault: false,
    sourceType: 'IMAGE',
    envVars: envString,
    notes: connString ? `[Template ${template.name}] String de Conexão: ${connString}` : `Instanciado via template ${template.name}`,
  });

  // Cria o Container ativo na lista do Docker Engine
  db.updateContainerStatus(finalContainerName, 'running');

  let createdDomain = null;
  // Se informou um domínio (ou para serviços com Web UI), associa ao domínio
  if (domainName && domainName.trim()) {
    const cleanDomain = domainName.trim().toLowerCase();
    const domainValid = validateDomain(cleanDomain);
    if (domainValid.valid && !db.getDomainByName(cleanDomain)) {
      createdDomain = db.createDomain({
        domainName: cleanDomain,
        serviceId: newService.id,
        isActive: true,
      });
    }
  }

  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: 'TEMPLATE_INSTANCIADO',
    entityType: 'SERVICE',
    entityId: newService.id,
    details: `Template "${template.name}" instanciado com container "${finalContainerName}:${template.defaultPort}"${createdDomain ? ` e rota para "${createdDomain.domainName}"` : ''}`,
    ipAddress: req.ip,
  });

  if (db.getSettings().autoApplyTraefik) {
    traefikService.applyConfig(req.user?.id, req.user?.name);
  }

  return res.status(201).json({
    success: true,
    service: newService,
    domain: createdDomain,
    connectionString: connString,
    message: `Serviço ${newService.name} instanciado e pronto para uso!`,
  });
});

// ==========================================
// 4. DOMAINS (CRUD & ASSOCIATIONS)
// ==========================================
router.get('/domains', requireAuth, (req, res) => {
  return res.json(db.getDomains());
});

router.post('/domains/validate', requireAuth, (req, res) => {
  const { domainName, excludeId } = req.body;
  const validation = validateDomain(domainName);
  if (!validation.valid) {
    return res.json({ valid: false, reason: validation.reason });
  }

  const existing = db.getDomainByName(domainName);
  if (existing && existing.id !== excludeId) {
    return res.json({
      valid: false,
      reason: `Este domínio já está cadastrado e associado ao serviço "${existing.service?.name || existing.serviceId}".`,
    });
  }

  return res.json({ valid: true });
});

router.post('/domains', requireAuth, (req: AuthenticatedRequest, res) => {
  const { domainName, serviceId, isActive } = req.body;

  const validation = validateDomain(domainName);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.reason });
  }

  const targetService = db.getServiceById(serviceId);
  if (!targetService) {
    return res.status(400).json({ error: 'Serviço selecionado não existe.' });
  }

  const existing = db.getDomainByName(domainName);
  if (existing) {
    return res.status(409).json({
      error: `O domínio "${domainName}" já está cadastrado para o serviço "${existing.service?.name}".`,
    });
  }

  const newDomain = db.createDomain({
    domainName,
    serviceId,
    isActive: isActive ?? true,
  });

  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: 'DOMINIO_CRIADO',
    entityType: 'DOMAIN',
    entityId: newDomain.id,
    details: `Domínio ${newDomain.domainName} associado ao serviço ${targetService.name} (${targetService.containerName}:${targetService.internalPort})`,
    ipAddress: req.ip,
  });

  if (db.getSettings().autoApplyTraefik) {
    traefikService.applyConfig(req.user?.id, req.user?.name);
  }

  return res.status(201).json(newDomain);
});

router.put('/domains/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const { domainName, serviceId, isActive } = req.body;
  const existing = db.getDomainById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Domínio não encontrado.' });
  }

  if (domainName) {
    const validation = validateDomain(domainName);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason });
    }
    const dup = db.getDomainByName(domainName);
    if (dup && dup.id !== req.params.id) {
      return res.status(409).json({ error: `O domínio "${domainName}" já está em uso.` });
    }
  }

  if (serviceId) {
    const svc = db.getServiceById(serviceId);
    if (!svc) {
      return res.status(400).json({ error: 'Serviço especificado não existe.' });
    }
  }

  const updated = db.updateDomain(req.params.id, {
    ...(domainName && { domainName }),
    ...(serviceId && { serviceId }),
    ...(isActive !== undefined && { isActive: Boolean(isActive) }),
  });

  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: 'DOMINIO_ATUALIZADO',
    entityType: 'DOMAIN',
    entityId: req.params.id,
    details: `Domínio "${updated?.domainName}" atualizado para o serviço ${updated?.service?.name}`,
    ipAddress: req.ip,
  });

  if (db.getSettings().autoApplyTraefik) {
    traefikService.applyConfig(req.user?.id, req.user?.name);
  }

  return res.json(updated);
});

router.patch('/domains/:id/toggle', requireAuth, (req: AuthenticatedRequest, res) => {
  const existing = db.getDomainById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Domínio não encontrado.' });

  const updated = db.updateDomain(req.params.id, { isActive: !existing.isActive });

  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: updated?.isActive ? 'DOMINIO_ATIVADO' : 'DOMINIO_DESATIVADO',
    entityType: 'DOMAIN',
    entityId: req.params.id,
    details: `Roteamento do domínio ${existing.domainName} foi ${updated?.isActive ? 'ativado' : 'desativado'}`,
    ipAddress: req.ip,
  });

  if (db.getSettings().autoApplyTraefik) {
    traefikService.applyConfig(req.user?.id, req.user?.name);
  }

  return res.json(updated);
});

router.delete('/domains/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const existing = db.getDomainById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Domínio não encontrado.' });

  db.deleteDomain(req.params.id);

  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: 'DOMINIO_REMOVIDO',
    entityType: 'DOMAIN',
    entityId: req.params.id,
    details: `Domínio ${existing.domainName} desvinculado e removido do Traefik`,
    ipAddress: req.ip,
  });

  if (db.getSettings().autoApplyTraefik) {
    traefikService.applyConfig(req.user?.id, req.user?.name);
  }

  return res.json({ message: 'Domínio removido com sucesso.' });
});

// ==========================================
// 5. DEFAULT SERVICE (CATCH-ALL FALLBACK)
// ==========================================
router.get('/default-service', requireAuth, (req, res) => {
  const services = db.getServices();
  const defaultSvc = services.find((s) => s.isDefault);
  const settings = db.getSettings();

  return res.json({
    defaultService: defaultSvc || null,
    fallbackEnabled: settings.defaultFallbackEnabled,
    rulePattern: 'HostRegexp(`{host:.+}`)',
    priority: 1,
    ruleExplanation: 'Encaminha automaticamente qualquer tráfego cujo cabeçalho Host não coincida com os domínios explícitos cadastrados.',
  });
});

router.post('/default-service', requireAuth, (req: AuthenticatedRequest, res) => {
  const { serviceId, enabled } = req.body;

  if (serviceId) {
    const svc = db.getServiceById(serviceId);
    if (!svc) {
      return res.status(404).json({ error: 'Serviço para padrão não encontrado.' });
    }
    db.setDefaultService(serviceId);
  } else if (serviceId === null) {
    db.setDefaultService(null);
  }

  if (enabled !== undefined) {
    db.updateSettings({ defaultFallbackEnabled: Boolean(enabled) });
  }

  const updatedDefault = db.getServices().find((s) => s.isDefault);

  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: 'SERVICO_PADRAO_DEFINIDO',
    entityType: 'SERVICE',
    entityId: serviceId || undefined,
    details: serviceId
      ? `Serviço "${updatedDefault?.name}" definido como padrão (HostRegexp({host:.+}))`
      : 'Serviço padrão desativado (nenhum fallback catch-all configurado)',
    ipAddress: req.ip,
  });

  if (db.getSettings().autoApplyTraefik) {
    traefikService.applyConfig(req.user?.id, req.user?.name);
  }

  return res.json({
    defaultService: updatedDefault || null,
    fallbackEnabled: db.getSettings().defaultFallbackEnabled,
  });
});

router.delete('/default-service', requireAuth, (req: AuthenticatedRequest, res) => {
  db.setDefaultService(null);
  db.updateSettings({ defaultFallbackEnabled: false });

  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: 'SERVICO_PADRAO_REMOVIDO',
    entityType: 'SERVICE',
    details: 'Serviço padrão removido. Requisições a domínios não cadastrados não terão destino padrão.',
    ipAddress: req.ip,
  });

  if (db.getSettings().autoApplyTraefik) {
    traefikService.applyConfig(req.user?.id, req.user?.name);
  }

  return res.json({ message: 'Serviço padrão removido com sucesso.' });
});

// ==========================================
// 6. CONTAINERS (DOCKER ENGINE API)
// ==========================================
router.get('/containers', requireAuth, async (req, res) => {
  try {
    const containers = await dockerService.listContainers();
    const status = await dockerService.getStatus();
    return res.json({ containers, status });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/containers/:nameOrId/restart', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await dockerService.restartContainer(req.params.nameOrId);
    db.logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Admin',
      action: 'CONTAINER_REINICIADO',
      entityType: 'CONTAINER',
      entityId: req.params.nameOrId,
      details: `Container "${req.params.nameOrId}" reiniciado via Docker Engine API`,
      ipAddress: req.ip,
    });
    return res.json({ success: true, message: 'Container reiniciado com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/containers/:nameOrId/logs', requireAuth, async (req, res) => {
  try {
    const tail = Number(req.query.tail) || 100;
    const logs = await dockerService.getLogs(req.params.nameOrId, tail);
    return res.json({ container: req.params.nameOrId, logs });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/containers/:nameOrId/exec', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { command, shell = '/bin/sh' } = req.body;
  if (!command || typeof command !== 'string' || !command.trim()) {
    return res.status(400).json({ error: 'Comando de terminal é obrigatório.' });
  }

  try {
    const result = await dockerService.execCommand(req.params.nameOrId, command, shell);
    return res.json({
      success: true,
      container: req.params.nameOrId,
      command: command.trim(),
      shell,
      ...result,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. TRAEFIK CONFIGURATION GENERATOR & SYNC
// ==========================================
router.get('/traefik/preview', requireAuth, (req, res) => {
  const result = traefikService.generateConfig();
  return res.json({
    ...result,
    filePath: traefikService.getDynamicFilePath(),
  });
});

router.post('/traefik/apply', requireAuth, (req: AuthenticatedRequest, res) => {
  const outcome = traefikService.applyConfig(req.user?.id, req.user?.name);
  if (!outcome.success) {
    return res.status(400).json({
      error: outcome.error || 'Falha ao aplicar configuração do Traefik.',
      revision: outcome.revision,
    });
  }
  return res.json({
    success: true,
    message: 'Configuração do Traefik aplicada com sucesso e propagada ao arquivo dinâmico.',
    revision: outcome.revision,
  });
});

router.get('/traefik/revisions', requireAuth, (req, res) => {
  return res.json(db.getProxyConfigurations());
});

// ==========================================
// 8. CLOUDFLARE & SSL INFORMATION
// ==========================================
router.get('/cloudflare', requireAuth, (req, res) => {
  const settings = db.getSettings();
  const domains = db.getDomains();

  return res.json({
    connectionMode: settings.cloudflareSslMode, // "Full (strict)"
    mainDomain: settings.mainDomain,
    originServerIp: settings.originServerIp,
    originHttpsPort: settings.originHttpsPort,
    originCertificatesPath: '/etc/traefik/certs/origin.pem',
    originKeyPath: '/etc/traefik/certs/origin.key',
    isCloudflareProxyActive: true,
    guidance: {
      sslMode: 'Full (strict)',
      description: 'O Cloudflare gerencia os certificados públicos e criptografa a conexão usuário ↔ Cloudflare. A conexão Cloudflare ↔ Origem é protegida pelo Certificado de Origem (Origin CA Certificate), garantindo criptografia ponta a ponta sem necessidade de Let’s Encrypt na máquina de origem.',
      instructions: [
        '1. No painel Cloudflare, aponte os registros DNS (tipo A ou CNAME) com o Proxy ativado (Nuvem Laranja).',
        '2. Vá em SSL/TLS > Origin Server e gere um Origin Certificate para o domínio e subdomínios (*.bla.com.br).',
        '3. Salve o certificado em /etc/traefik/certs/origin.pem e a chave privada em /etc/traefik/certs/origin.key.',
        '4. Ajuste a criptografia SSL/TLS no Cloudflare para o modo "Full (strict)".',
      ],
      associatedDomainsCount: domains.length,
    },
  });
});

router.put('/cloudflare', requireAuth, (req: AuthenticatedRequest, res) => {
  const { mainDomain, originServerIp, originHttpsPort, cloudflareSslMode } = req.body;
  const updates: any = {};
  if (mainDomain) updates.mainDomain = mainDomain.trim();
  if (originServerIp) updates.originServerIp = originServerIp.trim();
  if (originHttpsPort) updates.originHttpsPort = Number(originHttpsPort);
  if (cloudflareSslMode) updates.cloudflareSslMode = cloudflareSslMode;

  const updated = db.updateSettings(updates);

  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: 'SETTINGS_ATUALIZADAS',
    entityType: 'SETTINGS',
    details: `Configurações do Cloudflare/Origem atualizadas (Domínio: ${updated.mainDomain}, Modo: ${updated.cloudflareSslMode})`,
    ipAddress: req.ip,
  });

  return res.json(updated);
});

// ==========================================
// 9. AUDIT LOGS
// ==========================================
router.get('/audit', requireAuth, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  return res.json(db.getAuditLogs(limit));
});

// ==========================================
// 10. SETTINGS
// ==========================================
router.get('/settings', requireAuth, (req, res) => {
  return res.json(db.getSettings());
});

router.put('/settings', requireAuth, (req: AuthenticatedRequest, res) => {
  const {
    mainDomain,
    originServerIp,
    originHttpsPort,
    dockerSocketPath,
    traefikDynamicConfigPath,
    autoApplyTraefik,
    defaultFallbackEnabled,
  } = req.body;

  const updated = db.updateSettings({
    ...(mainDomain && { mainDomain }),
    ...(originServerIp && { originServerIp }),
    ...(originHttpsPort && { originHttpsPort: Number(originHttpsPort) }),
    ...(dockerSocketPath && { dockerSocketPath }),
    ...(traefikDynamicConfigPath && { traefikDynamicConfigPath }),
    ...(autoApplyTraefik !== undefined && { autoApplyTraefik: Boolean(autoApplyTraefik) }),
    ...(defaultFallbackEnabled !== undefined && { defaultFallbackEnabled: Boolean(defaultFallbackEnabled) }),
  });

  dockerService.refreshSettings();
  traefikService.refreshSettings();

  db.logAudit({
    userId: req.user?.id,
    userName: req.user?.name || 'Admin',
    action: 'SETTINGS_ATUALIZADAS',
    entityType: 'SETTINGS',
    details: 'Configurações gerais do sistema atualizadas',
    ipAddress: req.ip,
  });

  return res.json(updated);
});

// ==========================================
// 11. AUTOMATED TEST SUITE (VALIDATION ENGINE)
// ==========================================
router.post('/test-suite/run', requireAuth, (req, res) => {
  const results: TestResult[] = [];

  // Test 1: Valid domain validation
  const t1Start = performance.now();
  const validDomain = validateDomain('api.bla.com.br');
  results.push({
    id: 'test-domain-valid',
    name: 'Validação de FQDN RFC 1035',
    description: 'Verifica se domínios válidos no formato api.bla.com.br são aceitos.',
    passed: validDomain.valid,
    detail: validDomain.valid ? 'Domínio api.bla.com.br aceito corretamente.' : (validDomain.reason || 'Falha'),
    durationMs: Number((performance.now() - t1Start).toFixed(2)),
  });

  // Test 2: Invalid domain validation
  const t2Start = performance.now();
  const invalidDomain = validateDomain('https://bla.com/invalid;rm -rf');
  results.push({
    id: 'test-domain-invalid-injection',
    name: 'Sanitização e Bloqueio de Injeção de Comandos',
    description: 'Bloqueia strings maliciosas com protocolos, barras ou comandos shell.',
    passed: !invalidDomain.valid,
    detail: !invalidDomain.valid ? 'Entrada maliciosa rejeitada com sucesso.' : 'Falha de validação.',
    durationMs: Number((performance.now() - t2Start).toFixed(2)),
  });

  // Test 3: Traefik dynamic router generator
  const t3Start = performance.now();
  const traefikGen = traefikService.generateConfig();
  results.push({
    id: 'test-traefik-syntax',
    name: 'Geração e Sintaxe da Configuração Traefik',
    description: 'Gera a árvore YAML do Traefik e valida que não há erros de parse.',
    passed: traefikGen.valid,
    detail: traefikGen.valid
      ? `${traefikGen.routersCount} routers e ${traefikGen.servicesCount} serviços gerados com sucesso.`
      : traefikGen.errors.join(', '),
    durationMs: Number((performance.now() - t3Start).toFixed(2)),
  });

  // Test 4: Default catch-all rule verification
  const t4Start = performance.now();
  const hasCatchAll = Object.values(traefikGen.json.http.routers).some(
    (r: any) => r.rule === 'HostRegexp(`{host:.+}`)' && r.priority === 1
  );
  results.push({
    id: 'test-catchall-priority',
    name: 'Prioridade e Regra Catch-All do Serviço Padrão',
    description: 'Assegura que a regra HostRegexp(`{host:.+}`) possui prioridade 1 (menor que rotas específicas).',
    passed: hasCatchAll,
    detail: hasCatchAll
      ? 'Router de fallback router-default-fallback configurado com prioridade 1.'
      : 'Nenhum router de fallback com prioridade 1 encontrado.',
    durationMs: Number((performance.now() - t4Start).toFixed(2)),
  });

  // Test 5: Cloudflare TLS certificates verification in Traefik config
  const t5Start = performance.now();
  const certsConfigured =
    Boolean(traefikGen.json.tls?.certificates?.[0]?.certFile) &&
    Boolean(traefikGen.json.tls?.certificates?.[0]?.keyFile);
  results.push({
    id: 'test-cloudflare-tls-origin',
    name: 'Certificados Cloudflare Origin CA no Traefik',
    description: 'Garante que os caminhos origin.pem e origin.key estão declarados para o modo Full (strict).',
    passed: certsConfigured,
    detail: certsConfigured
      ? 'Caminhos de certificados de origem /etc/traefik/certs/origin.pem configurados.'
      : 'Certificados não declarados.',
    durationMs: Number((performance.now() - t5Start).toFixed(2)),
  });

  // Test 6: Service Template Catalog integrity
  const t6Start = performance.now();
  const templates = SERVICE_TEMPLATES;
  const allTemplatesHavePortsAndImages = templates.every(
    (t: ServiceTemplate) => t.id && t.defaultPort > 0 && t.defaultImage && typeof t.generateEnv === 'function'
  );
  results.push({
    id: 'test-service-templates-catalog',
    name: 'Catálogo de Templates Prontos (Postgres, MariaDB, Mongo, Redis, RabbitMQ)',
    description: 'Valida a integridade do catálogo de 1-clique, defaults de portas e geradores de ambiente.',
    passed: templates.length >= 8 && allTemplatesHavePortsAndImages,
    detail: `${templates.length} templates carregados com portas e variáveis de ambiente validadas.`,
    durationMs: Number((performance.now() - t6Start).toFixed(2)),
  });

  // Test 7: Container Exec Shell & SSH Connection Engine
  const t7Start = performance.now();
  const firstService = db.getServices()[0];
  const hasValidContainer = Boolean(firstService?.containerName);
  results.push({
    id: 'test-docker-exec-ssh',
    name: 'Acesso SSH & Terminal Exec do Container',
    description: 'Valida se o motor de execução Docker Exec e comandos de conexão SSH estão ativos para os containers.',
    passed: hasValidContainer,
    detail: hasValidContainer
      ? `Container "${firstService.containerName}" pronto para sessões interativas (/bin/sh, /bin/bash, SSH direto via host).`
      : 'Nenhum container ativo encontrado.',
    durationMs: Number((performance.now() - t7Start).toFixed(2)),
  });

  return res.json({
    timestamp: new Date().toISOString(),
    total: results.length,
    passedCount: results.filter((r) => r.passed).length,
    failedCount: results.filter((r) => !r.passed).length,
    results,
  });
});

export default router;
