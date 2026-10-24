import { Router } from 'express';
import { prisma, logAudit } from '../db.js';
import { traefikService } from '../services/traefik.service.js';
import { dockerService } from '../services/docker.service.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();
const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export function validateDomain(domain: string): { valid: boolean; reason?: string } {
  if (!domain || typeof domain !== 'string') {
    return { valid: false, reason: 'O nome de domínio é obrigatório.' };
  }
  const clean = domain.trim().toLowerCase();
  if (clean.length > 253) {
    return { valid: false, reason: 'O domínio excede o limite máximo de 253 caracteres.' };
  }
  if (!DOMAIN_REGEX.test(clean)) {
    return { valid: false, reason: 'Formato de domínio inválido (ex: api.meusite.com ou portal.empresa.com.br).' };
  }
  return { valid: true };
}

// 1. List all domains
router.get('/', requireAuth, async (req, res) => {
  try {
    const domains = await prisma.domain.findMany({
      include: { service: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(domains);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao buscar domínios: ${err.message}` });
  }
});

// 2. Validate domain RFC and duplication
router.post('/validate', requireAuth, async (req, res) => {
  const { domainName, excludeId } = req.body;
  const validation = validateDomain(domainName);
  if (!validation.valid) {
    return res.json({ valid: false, reason: validation.reason });
  }

  const clean = domainName.trim().toLowerCase();
  try {
    const existing = await prisma.domain.findFirst({
      where: {
        domainName: clean,
        id: excludeId ? { not: excludeId } : undefined,
      },
      include: { service: true },
    });

    if (existing) {
      return res.json({
        valid: false,
        reason: `O domínio "${clean}" já está vinculado ao serviço "${existing.service.name}".`,
      });
    }

    return res.json({ valid: true });
  } catch (err: any) {
    return res.status(500).json({ valid: false, reason: err.message });
  }
});

// 3. Create domain
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { domainName, serviceId, isActive, targetContainer, targetPort, healthCheckPath, loadBalanceMode } = req.body;

  const validation = validateDomain(domainName);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.reason });
  }
  if (!serviceId) {
    return res.status(400).json({ error: 'O identificador do serviço de destino é obrigatório.' });
  }

  const cleanDomain = domainName.trim().toLowerCase();

  try {
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) {
      return res.status(404).json({ error: 'Serviço de destino não encontrado.' });
    }

    const existing = await prisma.domain.findUnique({ where: { domainName: cleanDomain } });
    if (existing) {
      return res.status(409).json({ error: `O domínio "${cleanDomain}" já está cadastrado.` });
    }

    if (targetContainer) {
      if (typeof targetContainer === 'string' && targetContainer.startsWith('[')) {
        try {
          const list = JSON.parse(targetContainer);
          for (const item of list) {
            const c = typeof item === 'string' ? item : item.container;
            if (c) await dockerService.attachToNetwork(c);
          }
        } catch {}
      } else if (typeof targetContainer === 'string' && targetContainer.includes(',')) {
        for (const part of targetContainer.split(',')) {
          const c = part.trim().split(':')[0];
          if (c) await dockerService.attachToNetwork(c);
        }
      } else if (typeof targetContainer === 'string') {
        await dockerService.attachToNetwork(targetContainer.trim());
      }
    }

    const domain = await prisma.domain.create({
      data: {
        domainName: cleanDomain,
        serviceId,
        targetContainer: targetContainer ? (typeof targetContainer === 'string' ? targetContainer.trim() : JSON.stringify(targetContainer)) : null,
        targetPort: targetPort ? Number(targetPort) : null,
        healthCheckPath: healthCheckPath ? healthCheckPath.trim() : null,
        loadBalanceMode: loadBalanceMode || 'round_robin',
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        sslStatus: 'cloudflare_proxied',
      },
      include: { service: true },
    });

    // Atomic regeneration of Traefik dynamic_conf.yml
    await traefikService.applyConfig(req.user?.name || 'Administrador');

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'DOMAIN_CRIADO',
      entityType: 'DOMAIN',
      entityId: domain.id,
      details: `Domínio "${cleanDomain}" associado a ${targetContainer || service.containerName}.`,
      ipAddress: req.ip,
    });

    return res.status(201).json(domain);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao cadastrar domínio: ${err.message}` });
  }
});

// 4. Update domain
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { domainName, serviceId, isActive, targetContainer, targetPort, healthCheckPath, loadBalanceMode } = req.body;

  try {
    const domain = await prisma.domain.findUnique({ where: { id } });
    if (!domain) {
      return res.status(404).json({ error: 'Domínio não encontrado.' });
    }

    let cleanDomain = domain.domainName;
    if (domainName && domainName !== domain.domainName) {
      const validation = validateDomain(domainName);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.reason });
      }
      cleanDomain = domainName.trim().toLowerCase();
    }

    if (targetContainer) {
      if (typeof targetContainer === 'string' && targetContainer.startsWith('[')) {
        try {
          const list = JSON.parse(targetContainer);
          for (const item of list) {
            const c = typeof item === 'string' ? item : item.container;
            if (c) await dockerService.attachToNetwork(c);
          }
        } catch {}
      } else if (typeof targetContainer === 'string' && targetContainer.includes(',')) {
        for (const part of targetContainer.split(',')) {
          const c = part.trim().split(':')[0];
          if (c) await dockerService.attachToNetwork(c);
        }
      } else if (typeof targetContainer === 'string') {
        await dockerService.attachToNetwork(targetContainer.trim());
      }
    }

    const updated = await prisma.domain.update({
      where: { id },
      data: {
        domainName: cleanDomain,
        serviceId: serviceId || domain.serviceId,
        targetContainer: targetContainer !== undefined ? (typeof targetContainer === 'string' ? targetContainer.trim() : JSON.stringify(targetContainer)) : domain.targetContainer,
        targetPort: targetPort !== undefined ? (targetPort ? Number(targetPort) : null) : domain.targetPort,
        healthCheckPath: healthCheckPath !== undefined ? (healthCheckPath ? healthCheckPath.trim() : null) : domain.healthCheckPath,
        loadBalanceMode: loadBalanceMode || domain.loadBalanceMode,
        isActive: isActive !== undefined ? Boolean(isActive) : domain.isActive,
      },
      include: { service: true },
    });

    await traefikService.applyConfig(req.user?.name || 'Administrador');

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'DOMAIN_ATUALIZADO',
      entityType: 'DOMAIN',
      entityId: id,
      details: `Configurações do domínio "${cleanDomain}" alteradas.`,
      ipAddress: req.ip,
    });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao atualizar domínio: ${err.message}` });
  }
});

// 5. Toggle active
router.patch('/:id/toggle', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const domain = await prisma.domain.findUnique({ where: { id } });
    if (!domain) return res.status(404).json({ error: 'Domínio não encontrado.' });

    const updated = await prisma.domain.update({
      where: { id },
      data: { isActive: !domain.isActive },
      include: { service: true },
    });

    await traefikService.applyConfig(req.user?.name || 'Administrador');

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: updated.isActive ? 'DOMAIN_ATIVADO' : 'DOMAIN_DESATIVADO',
      entityType: 'DOMAIN',
      entityId: id,
      details: `Roteamento do domínio "${updated.domainName}" ${updated.isActive ? 'ativado' : 'desativado'}.`,
      ipAddress: req.ip,
    });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao alterar status do domínio: ${err.message}` });
  }
});

// 6. Delete domain
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const domain = await prisma.domain.findUnique({ where: { id } });
    if (!domain) return res.status(404).json({ error: 'Domínio não encontrado.' });

    await prisma.domain.delete({ where: { id } });
    await traefikService.applyConfig(req.user?.name || 'Administrador');

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'DOMAIN_EXCLUIDO',
      entityType: 'DOMAIN',
      entityId: id,
      details: `Domínio "${domain.domainName}" excluído e rota removida do Traefik.`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: `Domínio "${domain.domainName}" excluído.` });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao remover domínio: ${err.message}` });
  }
});

export default router;
