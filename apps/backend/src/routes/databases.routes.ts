import { Router } from 'express';
import { prisma, logAudit } from '../db.js';
import { databaseInspectorService } from '../services/database-inspector.service.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { parseServiceMetadata } from './services.routes.js';
import { config } from '../config.js';

const router = Router();

// Trava para ambientes de produção: Database Studio disponível apenas se enableBetaFeatures estiver ativo
router.use((_req, res, next) => {
  if (!config.enableBetaFeatures) {
    return res.status(403).json({
      error: 'O módulo de Bancos de Dados (Database Studio) está em desenvolvimento e temporariamente desabilitado em produção.',
      code: 'FEATURE_DISABLED_IN_PRODUCTION',
    });
  }
  next();
});

// 1. Listar todas as instâncias de bancos de dados do projeto
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { projectId } = req.query;

  try {
    const where: any = {};
    if (projectId && typeof projectId === 'string') {
      where.projectId = projectId;
    }

    const allServices = await prisma.service.findMany({
      where,
      include: {
        domains: true,
        project: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filtra serviços que são bancos de dados (Postgres, MariaDB, MySQL, Redis)
    const dbServices = allServices.filter((s) => {
      const img = (s.image || '').toLowerCase();
      const notes = (s.notes || '').toLowerCase();
      return (
        img.includes('postgres') ||
        img.includes('mariadb') ||
        img.includes('mysql') ||
        img.includes('redis') ||
        img.includes('mongo') ||
        notes.includes('postgresql') ||
        notes.includes('mariadb') ||
        notes.includes('redis')
      );
    });

    return res.json(dbServices);
  } catch (err: any) {
    console.error('Erro ao listar bancos de dados:', err);
    return res.status(500).json({ error: 'Erro ao listar instâncias de banco de dados.' });
  }
});

// 2. Obter catálogo e schema do banco (Tabelas, Colunas, Tipos, PKs, FKs, Views, Funções)
router.get('/:id/schema', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  try {
    const catalog = await databaseInspectorService.getDatabaseCatalog(id);
    return res.json(catalog);
  } catch (err: any) {
    console.error(`Erro ao inspecionar schema do banco ${id}:`, err);
    return res.status(500).json({ error: err.message || 'Erro ao inspecionar schema do banco de dados.' });
  }
});

// 3. Obter dados tabulares paginados
router.get('/:id/table-data', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const tableName = req.query.table as string;
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '50', 10);

  if (!tableName) {
    return res.status(400).json({ error: 'Parâmetro "table" é obrigatório.' });
  }

  try {
    const data = await databaseInspectorService.getTableData(id, tableName, page, limit);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao carregar dados da tabela.' });
  }
});

// 4. Executar consulta SQL no Console SQL
router.post('/:id/query', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { query: querySql } = req.body;

  if (!querySql || typeof querySql !== 'string') {
    return res.status(400).json({ error: 'Query SQL é obrigatória.' });
  }

  try {
    const result = await databaseInspectorService.executeSqlQuery(id, querySql);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Erro ao executar consulta SQL.' });
  }
});

// ==========================================
// ROTAS DO REDIS STUDIO
// ==========================================

// 5. Métricas do servidor Redis
router.get('/:id/redis/metrics', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  try {
    const metrics = await databaseInspectorService.getRedisMetrics(id);
    return res.json(metrics);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao obter métricas do Redis.' });
  }
});

// 6. Listar chaves do Redis
router.get('/:id/redis/keys', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const pattern = (req.query.pattern as string) || '*';

  try {
    const keys = await databaseInspectorService.getRedisKeys(id, pattern);
    return res.json(keys);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao listar chaves do Redis.' });
  }
});

// 7. Obter detalhes e valor de uma chave
router.get('/:id/redis/key', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const key = req.query.key as string;

  if (!key) {
    return res.status(400).json({ error: 'Chave é obrigatória.' });
  }

  try {
    const detail = await databaseInspectorService.getRedisKeyDetail(id, key);
    return res.json(detail);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao obter detalhes da chave.' });
  }
});

// 8. Salvar ou criar chave no Redis
router.post('/:id/redis/key', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { key, value, type = 'string', ttl, hashField } = req.body;

  if (!key || value === undefined) {
    return res.status(400).json({ error: 'Chave e valor são obrigatórios.' });
  }

  try {
    await databaseInspectorService.setRedisKey(id, key, value, type, ttl, hashField);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao salvar chave no Redis.' });
  }
});

// 9. Excluir chave do Redis
router.delete('/:id/redis/key', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const key = req.query.key as string;

  if (!key) {
    return res.status(400).json({ error: 'Chave é obrigatória.' });
  }

  try {
    await databaseInspectorService.deleteRedisKey(id, key);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao excluir chave do Redis.' });
  }
});

// 10. Executar comando CLI no Redis
router.post('/:id/redis/command', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'Comando é obrigatório.' });
  }

  try {
    const output = await databaseInspectorService.executeRedisCommand(id, command);
    return res.json({ output });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Erro ao executar comando Redis.' });
  }
});

export default router;
