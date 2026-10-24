import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados SQLite...');

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
  console.log('⚙️ Configurações da aplicação inicializadas.');

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
  console.log('🌐 Domínios iniciais cadastrados.');

  console.log('✅ Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
