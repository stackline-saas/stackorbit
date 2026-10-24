import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do PostgreSQL...');

  // 1. Admin User
  const passwordHash = await bcrypt.hash('admin123', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@bla.com.br' },
    update: {},
    create: {
      name: 'Administrador Docker',
      email: 'admin@bla.com.br',
      passwordHash,
      role: 'ADMIN',
    },
  });
  console.log(`👤 Usuário administrador criado: ${adminUser.email}`);

  // 2. App Settings
  await prisma.appSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      mainDomain: 'bla.com.br',
      originServerIp: '127.0.0.1',
      originHttpsPort: 443,
      cloudflareSslMode: 'Full (strict)',
      dockerSocketPath: '/var/run/docker.sock',
      traefikDynamicConfigPath: './traefik/dynamic/dynamic_conf.yml',
      autoApplyTraefik: true,
      defaultFallbackEnabled: true,
    },
  });
  console.log('⚙️ Configurações da aplicação inicializadas no PostgreSQL.');

  // 2.1 Default Project & Host
  const defaultProject = await prisma.project.upsert({
    where: { slug: 'default' },
    update: {},
    create: {
      name: 'Projeto Principal',
      slug: 'default',
      description: 'Ambiente principal de produção e orquestração de serviços',
      type: 'STANDALONE',
      isDefault: true,
    },
  });

  const defaultHost = await prisma.dockerHost.upsert({
    where: { id: 'default-host' },
    update: {},
    create: {
      id: 'default-host',
      name: 'Servidor Principal (Docker Local/SSH)',
      projectId: defaultProject.id,
      type: process.env.DOCKER_HOST?.startsWith('ssh://') ? 'SSH' : 'LOCAL_SOCKET',
      status: 'ONLINE',
      endpointUrl: process.env.DOCKER_HOST || process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
      isDefault: true,
    },
  });

  // Link existing orphan services to default project and host
  await prisma.service.updateMany({
    where: { projectId: null },
    data: {
      projectId: defaultProject.id,
      dockerHostId: defaultHost.id,
    },
  });
  console.log('🏢 Projeto Principal e Host Padrão inicializados com sucesso.');

  // 3. Initial Services
  const srvApi = await prisma.service.upsert({
    where: { containerName: 'api' },
    update: {},
    create: {
      name: 'API Backend',
      containerName: 'api',
      image: 'node:20-alpine',
      internalPort: 8080,
      status: 'running',
      isActive: true,
      isDefault: false,
      notes: 'API REST principal para microserviços',
    },
  });

  const srvAdmin = await prisma.service.upsert({
    where: { containerName: 'admin' },
    update: {},
    create: {
      name: 'Painel Admin',
      containerName: 'admin',
      image: 'nginx:alpine',
      internalPort: 80,
      status: 'running',
      isActive: true,
      isDefault: false,
      notes: 'Interface de gestão de retaguarda',
    },
  });

  const srvPortal = await prisma.service.upsert({
    where: { containerName: 'web-portal' },
    update: {},
    create: {
      name: 'Portal Geral (Padrão)',
      containerName: 'web-portal',
      image: 'nginx:alpine',
      internalPort: 80,
      status: 'running',
      isActive: true,
      isDefault: true,
      notes: 'Portal principal e fallback para qualquer requisição não roteada',
    },
  });
  console.log('📦 Serviços iniciais cadastrados.');

  // 4. Initial Domains
  await prisma.domain.upsert({
    where: { domainName: 'api.bla.com.br' },
    update: {},
    create: {
      domainName: 'api.bla.com.br',
      serviceId: srvApi.id,
      isActive: true,
      sslStatus: 'cloudflare_proxied',
    },
  });

  await prisma.domain.upsert({
    where: { domainName: 'admin.bla.com.br' },
    update: {},
    create: {
      domainName: 'admin.bla.com.br',
      serviceId: srvAdmin.id,
      isActive: true,
      sslStatus: 'cloudflare_proxied',
    },
  });

  await prisma.domain.upsert({
    where: { domainName: 'bla.com.br' },
    update: {},
    create: {
      domainName: 'bla.com.br',
      serviceId: srvPortal.id,
      isActive: true,
      sslStatus: 'cloudflare_proxied',
    },
  });
  console.log('🌐 Domínios iniciais cadastrados no PostgreSQL.');

  console.log('✅ Seed do PostgreSQL concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
