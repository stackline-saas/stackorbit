import assert from 'node:assert';
import fs from 'node:fs';
import { prisma } from './db.js';
import { traefikService } from './services/traefik.service.js';
import { dockerService } from './services/docker.service.js';
import { hashPassword, verifyPassword, generateToken } from './middleware/auth.middleware.js';
import { validateDomain } from './routes/domains.routes.js';
import YAML from 'yaml';

async function runTests() {
  console.log('🧪 Iniciando Bateria de Testes do Backend & Worker...');
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Password Hashing & Verification
  await test('Criptografia Bcrypt (Hash & Verify)', async () => {
    const rawPass = 'Secret123!';
    const hash = await hashPassword(rawPass);
    assert(hash !== rawPass, 'Hash deve ser diferente da senha original');
    const valid = await verifyPassword(rawPass, hash);
    assert(valid === true, 'Senha deve validar com sucesso');
    const invalid = await verifyPassword('WrongPassword', hash);
    assert(invalid === false, 'Senha incorreta deve ser rejeitada');
  });

  // 2. JWT Generation & Payload
  await test('Geração de Token JWT', async () => {
    const token = generateToken({
      id: 'usr_1',
      name: 'Admin Test',
      email: 'admin@test.com',
      role: 'ADMIN',
    });
    assert(typeof token === 'string' && token.length > 20, 'Token JWT deve ser uma string válida');
  });

  // 3. FQDN Domain Validation (RFC 1035/1123)
  await test('Validação RFC 1035 de Domínios', async () => {
    assert(validateDomain('api.empresa.com.br').valid === true);
    assert(validateDomain('portal.io').valid === true);
    assert(validateDomain('invalid_domain..com').valid === false);
    assert(validateDomain('http://site.com').valid === false);
    assert(validateDomain('site.com; rm -rf /').valid === false);
  });

  // 4. Prisma PostgreSQL Database Queries
  await test('Persistência e Consulta no PostgreSQL via Prisma', async () => {
    const user = await prisma.user.findFirst({ where: { email: 'admin@bla.com.br' } });
    assert(user !== null, 'Usuário admin deve existir no seed');
    assert(user?.role === 'ADMIN', 'Papel deve ser ADMIN');

    const services = await prisma.service.findMany();
    assert(services.length >= 3, 'Devem existir os serviços iniciais do seed');

    const defaultSrv = services.find((s) => s.isDefault);
    assert(defaultSrv !== undefined, 'Deve existir um serviço padrão configurado');
  });

  // 5. Traefik YAML Generator & Catch-All Priority
  await test('Gerador Dinâmico Traefik (Routers, Catch-All & TLS)', async () => {
    const applied = await traefikService.applyConfig('Test Runner');
    assert(applied.version >= 1, 'Versão do proxy deve ser >= 1');
    assert(fs.existsSync(applied.path), 'Arquivo físico dynamic_conf.yml deve existir');

    const yamlString = applied.yaml;
    assert(yamlString.includes('Host(`api.bla.com.br`)'), 'Deve conter rota para api.bla.com.br');
    assert(yamlString.includes('HostRegexp'), 'Deve conter regra fallback HostRegexp');
    assert(yamlString.includes('/etc/traefik/certs/origin.pem'), 'Deve declarar certificado Origin CA');

    const parsed = YAML.parse(yamlString);
    assert(parsed.http.routers['router-api-bla-com-br'].priority === 100, 'Prioridade de rota explícita deve ser 100');
    assert(parsed.http.routers['router-default-fallback'].priority === 1, 'Prioridade do fallback deve ser 1');
  });

  // 6. Dockerode Client & Status
  await test('Conexão Dockerode com Docker Daemon', async () => {
    const status = await dockerService.getStatus();
    assert(typeof status.connected === 'boolean', 'Status deve reportar connected');
    console.log(`     (Docker conectado: ${status.connected}, Socket: ${status.socketPath})`);
  });

  console.log(`\n==================================================`);
  console.log(`📊 Resultado dos Testes: ${passed} passaram, ${failed} falharam.`);
  console.log(`==================================================\n`);

  if (failed > 0) process.exit(1);
}

runTests()
  .catch((e) => {
    console.error('Erro fatal nos testes:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
