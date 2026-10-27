import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  // Trava de funcionalidades em desenvolvimento/beta (Sites Web, Database Studio, etc.)
  // Por padrão: Habilitado apenas em desenvolvimento. Bloqueado em produção a menos que ENABLE_BETA_FEATURES=true
  enableBetaFeatures: process.env.ENABLE_BETA_FEATURES !== undefined
    ? process.env.ENABLE_BETA_FEATURES === 'true'
    : (process.env.NODE_ENV !== 'production'),
  jwtSecret: process.env.JWT_SECRET || 'stackorbit-jwt-secret-key-2026-strict',
  jwtExpiresIn: '7d',
  
  // Docker socket: Support Windows Named Pipe or Unix Socket
  get dockerSocketPath(): string {
    if (process.env.DOCKER_SOCKET_PATH && fs.existsSync(process.env.DOCKER_SOCKET_PATH)) {
      return process.env.DOCKER_SOCKET_PATH;
    }
    if (process.platform === 'win32') {
      return '//./pipe/docker_engine';
    }
    return '/var/run/docker.sock';
  },

  traefikDynamicConfigPath: path.resolve(
    process.cwd(),
    process.env.TRAEFIK_DYNAMIC_CONFIG_PATH || '../../traefik/dynamic/dynamic_conf.yml'
  ),
  
  traefikCertsDir: path.resolve(
    process.cwd(),
    process.env.TRAEFIK_CERTS_DIR || '../../traefik/certs'
  ),

  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  networkName: process.env.DOCKER_NETWORK || 'proxy-net',
};
