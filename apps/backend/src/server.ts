import express from 'express';
import http from 'node:http';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { prisma, logAudit } from './db.js';
import { traefikService } from './services/traefik.service.js';
import { agentGateway } from './services/agent-gateway.js';

// Import Routes
import authRoutes from './routes/auth.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import servicesRoutes from './routes/services.routes.js';
import domainsRoutes from './routes/domains.routes.js';
import containersRoutes from './routes/containers.routes.js';
import traefikRoutes from './routes/traefik.routes.js';
import cloudflareRoutes from './routes/cloudflare.routes.js';
import templatesRoutes from './routes/templates.routes.js';
import auditRoutes from './routes/audit.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import testSuiteRoutes from './routes/test-suite.routes.js';
import webhooksRoutes from './routes/webhooks.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import hostsRoutes from './routes/hosts.routes.js';
import systemRoutes from './routes/system.routes.js';
import { integrationsRouter } from './routes/integrations.routes.js';
import { requireAuth, type AuthenticatedRequest } from './middleware/auth.middleware.js';

const app = express();

// Security & Parsing Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Request Logger (Dev / Production)
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    });
  }
  next();
});

// ==========================================
// API ROUTES
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/hosts', hostsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/domains', domainsRoutes);
app.use('/api/containers', containersRoutes);
app.use('/api/docker/containers', containersRoutes); // Route alias for frontend compatibility
app.use('/api/traefik', traefikRoutes);
app.use('/api/cloudflare', cloudflareRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/test-suite', testSuiteRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/integrations', requireAuth, integrationsRouter);
app.use('/api/system', systemRoutes);

// Compatibility route for /api/default-service
app.get('/api/default-service', requireAuth, async (req, res) => {
  try {
    const service = await prisma.service.findFirst({
      where: { isDefault: true },
      include: { domains: true },
    });
    return res.json({ service: service || null });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao obter serviço padrão: ${err.message}` });
  }
});

app.post('/api/default-service', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { serviceId } = req.body;
  try {
    await prisma.service.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    let service = null;
    if (serviceId) {
      service = await prisma.service.update({
        where: { id: serviceId },
        data: { isDefault: true },
      });
    }
    await traefikService.applyConfig(req.user?.name || 'Administrador');
    return res.json({ success: true, service });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao definir serviço padrão: ${err.message}` });
  }
});

app.delete('/api/default-service', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await prisma.service.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    await traefikService.applyConfig(req.user?.name || 'Administrador');
    return res.json({ success: true, message: 'Serviço padrão removido com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro ao remover serviço padrão: ${err.message}` });
  }
});

// ==========================================
// SERVING FRONTEND SPA (dist) IN PRODUCTION
// ==========================================
const frontendDistCandidates = [
  path.resolve(process.cwd(), 'public'),
  path.resolve(process.cwd(), 'apps/frontend/dist'),
  path.resolve(process.cwd(), '../frontend/dist'),
  path.resolve(process.cwd(), 'dist/public'),
  path.resolve(process.cwd(), 'frontend-dist'),
];

let frontendDistPath: string | null = null;
for (const cand of frontendDistCandidates) {
  if (fs.existsSync(cand) && fs.existsSync(path.join(cand, 'index.html'))) {
    frontendDistPath = cand;
    break;
  }
}

if (frontendDistPath) {
  console.log(`📁 Servindo Frontend SPA compilado de: ${frontendDistPath}`);
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res, next) => {
    if (req.originalUrl.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath!, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      name: 'Docker Domain Manager API',
      status: 'online',
      version: '1.0.0',
      docs: '/api/dashboard',
    });
  });
}

// 404 Handler for API
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Endpoint não encontrado: ${req.method} ${req.originalUrl}` });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[SERVER ERROR]:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Erro interno no servidor.',
  });
});

// Start Server
async function start() {
  try {
    // Generate initial dynamic configuration for Traefik if not present
    await traefikService.applyConfig('Inicialização do Sistema');
    console.log('✅ Traefik Dynamic Configuration gerada e sincronizada.');
  } catch (e: any) {
    console.warn('Aviso na inicialização do Traefik:', e.message);
  }

  const server = http.createServer(app);
  agentGateway.setupWebSocket(server);

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(`🚀 Docker Domain Manager Backend API`);
    console.log(`📡 Porta: ${config.port}`);
    console.log(`🐳 Docker Socket: ${config.dockerSocketPath}`);
    console.log(`🌐 Ambiente: ${config.nodeEnv}`);
    console.log(`🛡️ Traefik Dynamic: ${config.traefikDynamicConfigPath}`);
    console.log(`==================================================\n`);
  });
}

start().catch((err) => {
  console.error('Falha ao iniciar backend:', err);
  process.exit(1);
});

export default app;
