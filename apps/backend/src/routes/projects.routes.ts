import { Router } from 'express';
import { prisma, logAudit } from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';

const router = Router();

// 1. Listar todos os Projetos com contadores
router.get('/', requireAuth, async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      include: {
        _count: {
          select: {
            hosts: true,
            services: true,
          },
        },
        hosts: {
          select: {
            id: true,
            name: true,
            status: true,
            type: true,
            isDefault: true,
            isSwarmManager: true,
            containersCount: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    const enriched = projects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      type: p.type,
      isDefault: p.isDefault,
      hostsCount: p._count.hosts,
      servicesCount: p._count.services,
      hosts: p.hosts,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return res.json(enriched);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao listar projetos: ${err.message}` });
  }
});

// 2. Obter Detalhes do Projeto
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: {
        OR: [{ id: req.params.id }, { slug: req.params.id }],
      },
      include: {
        hosts: true,
        services: {
          include: {
            domains: true,
            dockerHost: {
              select: { id: true, name: true, status: true, type: true },
            },
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Projeto não encontrado.' });
    }

    return res.json(project);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao obter projeto: ${err.message}` });
  }
});

// 3. Criar Novo Projeto
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { name, description, type } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Nome do projeto é obrigatório.' });
  }

  const cleanName = name.trim();
  const slug = cleanName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  try {
    const existing = await prisma.project.findFirst({
      where: { OR: [{ name: cleanName }, { slug }] },
    });

    if (existing) {
      return res.status(409).json({ error: `Já existe um projeto com o nome "${cleanName}".` });
    }

    const project = await prisma.project.create({
      data: {
        name: cleanName,
        slug,
        description: description?.trim() || null,
        type: type === 'SWARM' ? 'SWARM' : 'STANDALONE',
        isDefault: false,
      },
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'PROJETO_CRIADO',
      entityType: 'PROJECT',
      entityId: project.id,
      details: `Projeto "${project.name}" (${project.type}) criado.`,
      ipAddress: req.ip,
    });

    return res.status(201).json(project);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao criar projeto: ${err.message}` });
  }
});

// 4. Atualizar Projeto
router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { name, description, type } = req.body;

  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });

    let slug = project.slug;
    if (name && name.trim() !== project.name) {
      slug = name
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        name: name ? name.trim() : undefined,
        slug: name ? slug : undefined,
        description: description !== undefined ? description?.trim() : undefined,
        type: type === 'SWARM' ? 'SWARM' : type === 'STANDALONE' ? 'STANDALONE' : undefined,
      },
    });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'PROJETO_ATUALIZADO',
      entityType: 'PROJECT',
      entityId: updated.id,
      details: `Projeto "${updated.name}" atualizado.`,
      ipAddress: req.ip,
    });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao atualizar projeto: ${err.message}` });
  }
});

// 5. Excluir Projeto
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { services: true, hosts: true },
    });

    if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });
    if (project.isDefault) {
      return res.status(400).json({ error: 'O projeto principal padrão não pode ser excluído.' });
    }

    if (project.services.length > 0) {
      return res.status(400).json({
        error: `Não é possível excluir o projeto pois existem ${project.services.length} serviço(s) vinculado(s). Migre ou remova os serviços primeiro.`,
      });
    }

    await prisma.project.delete({ where: { id: req.params.id } });

    await logAudit({
      userId: req.user?.id,
      userName: req.user?.name || 'Administrador',
      action: 'PROJETO_REMOVIDO',
      entityType: 'PROJECT',
      entityId: req.params.id,
      details: `Projeto "${project.name}" removido.`,
      ipAddress: req.ip,
    });

    return res.json({ success: true, message: `Projeto "${project.name}" removido com sucesso.` });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao remover projeto: ${err.message}` });
  }
});

export default router;
