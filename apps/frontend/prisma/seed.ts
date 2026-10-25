/**
 * Script de inicialização do banco de dados (Prisma Seed)
 * Cria o usuário administrador padrão, serviços de exemplo e domínios.
 */

import crypto from 'node:crypto';

function hashPassword(password: string, salt = 'stackorbit-salt-2026'): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

export const initialSeedData = {
  adminUser: {
    email: 'admin@bla.com.br',
    name: 'Administrador Docker',
    passwordHash: hashPassword('admin123'),
    role: 'ADMIN',
  },
  services: [
    {
      name: 'API Backend',
      containerName: 'api',
      image: 'node:20-alpine',
      internalPort: 8080,
      status: 'RUNNING',
      isActive: true,
      isDefault: false,
      notes: 'API de microsserviços',
      domain: 'api.bla.com.br',
    },
    {
      name: 'Painel Administrativo',
      containerName: 'admin',
      image: 'nginx:alpine',
      internalPort: 80,
      status: 'RUNNING',
      isActive: true,
      isDefault: false,
      notes: 'Interface de retaguarda',
      domain: 'admin.bla.com.br',
    },
    {
      name: 'Portal Geral (Padrão)',
      containerName: 'web-portal',
      image: 'caddy:alpine',
      internalPort: 80,
      status: 'RUNNING',
      isActive: true,
      isDefault: true,
      notes: 'Destino fallback para qualquer domínio não cadastrado (HostRegexp({host:.+}))',
      domain: null,
    },
  ],
};

console.log('Dados de seed configurados com sucesso.');
