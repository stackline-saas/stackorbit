import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { dockerService } from './docker.service.js';

export interface TraefikHttpRouter {
  rule: string;
  entryPoints: string[];
  service: string;
  priority: number;
  middlewares?: string[];
  tls?: Record<string, any>;
}

export interface TraefikHttpService {
  loadBalancer: {
    servers: Array<{ url: string }>;
    passHostHeader: boolean;
    healthCheck?: {
      path: string;
      interval?: string;
      timeout?: string;
    };
  };
}

export interface TargetServer {
  container: string;
  port: number;
}

export function resolveTargetUrl(
  target: TargetServer,
  host?: { endpointUrl?: string; type?: string; isDefault?: boolean } | null
): string {
  if (target.container.startsWith('http://') || target.container.startsWith('https://')) {
    return target.container;
  }

  // If container is an IP address or hostname
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(target.container) || target.container.includes('.')) {
    return `http://${target.container}:${target.port}`;
  }

  // If service is hosted on a remote host (not default local socket)
  if (host && !host.isDefault && host.endpointUrl) {
    let hostAddress: string | null = null;
    try {
      if (host.endpointUrl.startsWith('ssh://')) {
        const u = new URL(host.endpointUrl);
        hostAddress = u.hostname;
      } else if (host.endpointUrl.startsWith('tcp://') || host.endpointUrl.startsWith('http://')) {
        const u = new URL(host.endpointUrl.replace('tcp://', 'http://'));
        hostAddress = u.hostname;
      }
    } catch {
      // fallback
    }

    if (hostAddress && hostAddress !== '127.0.0.1' && hostAddress !== 'localhost') {
      return `http://${hostAddress}:${target.port}`;
    }
  }

  return `http://${target.container}:${target.port}`;
}

export function parseDomainTargets(
  targetContainer: string | null | undefined,
  targetPort: number | null | undefined,
  defaultContainer: string,
  defaultPort: number
): TargetServer[] {
  if (!targetContainer) {
    return [{ container: defaultContainer, port: targetPort || defaultPort }];
  }

  const trimmed = targetContainer.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item: any) => ({
          container: typeof item === 'string' ? item : item.container || defaultContainer,
          port: item.port ? Number(item.port) : targetPort || defaultPort,
        }));
      }
    } catch {
      // ignore
    }
  }

  if (trimmed.includes(',')) {
    return trimmed.split(',').map((part) => {
      const [c, p] = part.trim().split(':');
      return {
        container: c,
        port: p ? Number(p) : targetPort || defaultPort,
      };
    });
  }

  return [{ container: trimmed, port: targetPort || defaultPort }];
}

export interface TraefikConfig {
  http: {
    routers: Record<string, TraefikHttpRouter>;
    services: Record<string, TraefikHttpService>;
    middlewares: Record<string, any>;
  };
  tls: {
    certificates: Array<{
      certFile: string;
      keyFile: string;
      stores: string[];
    }>;
  };
}

export class TraefikService {
  private configPath: string;

  constructor() {
    this.configPath = config.traefikDynamicConfigPath;
  }

  public async generateConfigObject(): Promise<TraefikConfig> {
    const services = await prisma.service.findMany({
      where: { isActive: true },
      include: {
        domains: {
          where: { isActive: true },
        },
        dockerHost: {
          select: { id: true, name: true, type: true, endpointUrl: true, isDefault: true },
        },
      },
    });

    const defaultService = services.find((s) => s.isDefault);

    const routers: Record<string, TraefikHttpRouter> = {};
    const httpServices: Record<string, TraefikHttpService> = {};

    // Generate routers for all domains
    for (const service of services) {
      for (const domain of service.domains) {
        // Resolve target containers and ports (supports Load Balancing across multiple replicas)
        const targets = parseDomainTargets(
          domain.targetContainer,
          domain.targetPort,
          service.containerName,
          service.internalPort
        );

        const traefikServiceName = `service-${domain.domainName.replace(/[^a-zA-Z0-9-]/g, '-')}`;

        httpServices[traefikServiceName] = {
          loadBalancer: {
            servers: targets.map((t) => ({ url: resolveTargetUrl(t, service.dockerHost) })),
            passHostHeader: true,
            ...(domain.healthCheckPath
              ? {
                  healthCheck: {
                    path: domain.healthCheckPath.startsWith('/') ? domain.healthCheckPath : `/${domain.healthCheckPath}`,
                    interval: '5s',
                    timeout: '2s',
                  },
                }
              : {}),
          },
        };

        const routerKey = `router-${domain.domainName.replace(/[^a-zA-Z0-9-]/g, '-')}`;
        routers[routerKey] = {
          rule: `Host(\`${domain.domainName}\`)`,
          entryPoints: ['websecure', 'web'],
          service: traefikServiceName,
          priority: 100,
          middlewares: ['cloudflare-realip'],
          tls: {},
        };
      }
    }

    // Default Fallback Catch-All
    if (defaultService) {
      const traefikDefaultServiceName = `service-${defaultService.containerName}`;
      httpServices[traefikDefaultServiceName] = {
        loadBalancer: {
          servers: [
            {
              url: resolveTargetUrl(
                { container: defaultService.containerName, port: defaultService.internalPort },
                defaultService.dockerHost
              ),
            },
          ],
          passHostHeader: true,
        },
      };

      routers['router-default-fallback'] = {
        rule: 'HostRegexp(`^.+$`)',
        entryPoints: ['websecure', 'web'],
        service: traefikDefaultServiceName,
        priority: 1,
        middlewares: ['cloudflare-realip'],
        tls: {},
      };
    }

    const traefikConfig: TraefikConfig = {
      http: {
        routers,
        services: httpServices,
        middlewares: {
          'cloudflare-realip': {
            headers: {
              customRequestHeaders: {
                'X-Forwarded-Proto': 'https',
              },
              sslProxyHeaders: {
                'X-Forwarded-Proto': 'https',
              },
            },
          },
        },
      },
      tls: {
        certificates: [
          {
            certFile: '/etc/traefik/certs/origin.pem',
            keyFile: '/etc/traefik/certs/origin.key',
            stores: ['default'],
          },
        ],
      },
    };

    return traefikConfig;
  }

  public async generateYamlString(): Promise<string> {
    const configObj = await this.generateConfigObject();
    const commentHeader = [
      '# ===================================================================',
      '# TRAEFIK DYNAMIC CONFIGURATION - GERADO AUTOMATICAMENTE PELO BACKEND',
      `# Gerado em: ${new Date().toISOString()}`,
      '# ===================================================================\n',
    ].join('\n');

    return commentHeader + YAML.stringify(configObj, { indent: 2 });
  }

  public ensureCertificatesExist(): void {
    const certsDir = config.traefikCertsDir;
    if (!fs.existsSync(certsDir)) {
      fs.mkdirSync(certsDir, { recursive: true });
    }
    const certFile = path.resolve(certsDir, 'origin.pem');
    const keyFile = path.resolve(certsDir, 'origin.key');

    const defaultCert = [
      '-----BEGIN CERTIFICATE-----',
      'MIIDBTCCAe2gAwIBAgIUUDrFJXBb+VqMKkJgYgzJXIMeR/YwDQYJKoZIhvcNAQEL',
      'BQAwEjEQMA4GA1UEAwwHZGVmYXVsdDAeFw0yNjEwMjIxMjQ3MzJaFw0zNjEwMTkx',
      'MjQ3MzJaMBIxEDAOBgNVBAMMB2RlZmF1bHQwggEiMA0GCSqGSIb3DQEBAQUAA4IB',
      'DwAwggEKAoIBAQDDrU3yXgAR3z2MHEezzYpqIZjXxKQH+fbW9cnyyORxNBcSfKGj',
      'P1fFGMTp05GlQgmK5iShu7YoXY5/qmU8qtdfhvNK+Ff/sbW0NjDQqYWBGpr7KXMw',
      'K+TnAIyZJnfFSlnWESdN2aLHfygjGbjx+HXQlxHZ8dgMddXN8MzTMs/EreO3qZzy',
      'XGJiembEWHmf6RXijm9gTOWgAT2URp1Noz7mryHR/kMgv/V7pvmk3d3M3qpexX88',
      'O8Eefnv9ARJtrOBjvVz5uEPxwqwO4L9H5wCzoPDDTTJNsrFBJK4nMxFgdrU8Vts/',
      'TghfPnGTrjb9L6ma0NYFxx8b7cBrK7OrLIMfAgMBAAGjUzBRMB0GA1UdDgQWBBSx',
      'n+0bWv4YakrLWWumzFf7plAdFjAfBgNVHSMEGDAWgBSxn+0bWv4YakrLWWumzFf7',
      'plAdFjAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQBEi2ZzZaU6',
      'VVPx5pwFE9x6MCgg7FgZvF/GolVJi+eWcGCT8vNSqVumrMUndrcjPZN0SENYMRXb',
      'pc25Dctovcw/ldlX/+9j2Y7dl7MFmGFcNHqGP/wl+PfVA2AoRMnraJS2R6RBj5/d',
      'JkUjITpHE1/3Y+O1HYweSV+1P3tZXvGd8Bp+hKAqBcSkIBa6xDW9VcqGOr9G4fdW',
      '1d8dcIWN7N2sm+cIWn2mxiuLDNn24pZPkwjkgjA+EA4FRwpWwAwDAi/qwoUGEoPr',
      'BFPG7cIYqqEDagFhSGzutLBByYN50Kw0e0A959Noe1H9Kk5b/oyGzSLB3ut/XMwS',
      'H0bWSn3yeF+6',
      '-----END CERTIFICATE-----',
      '',
    ].join('\n');

    const defaultKey = [
      '-----BEGIN PRIVATE KEY-----',
      'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDDrU3yXgAR3z2M',
      'HEezzYpqIZjXxKQH+fbW9cnyyORxNBcSfKGjP1fFGMTp05GlQgmK5iShu7YoXY5/',
      'qmU8qtdfhvNK+Ff/sbW0NjDQqYWBGpr7KXMwK+TnAIyZJnfFSlnWESdN2aLHfygj',
      'Gbjx+HXQlxHZ8dgMddXN8MzTMs/EreO3qZzyXGJiembEWHmf6RXijm9gTOWgAT2U',
      'Rp1Noz7mryHR/kMgv/V7pvmk3d3M3qpexX88O8Eefnv9ARJtrOBjvVz5uEPxwqwO',
      '4L9H5wCzoPDDTTJNsrFBJK4nMxFgdrU8Vts/TghfPnGTrjb9L6ma0NYFxx8b7cBr',
      'K7OrLIMfAgMBAAECggEAUB/BOJq0FZ1fUuVrmNzzrgSm1MdQ0XFR2XCYqmEHZbFK',
      'N0gwWavA0VSUoRiAXXZ+eNFHM7Cs5Ld2d6E6xg5AlX2pVsv9IJbQjAPalj6sC5Ls',
      '3iZ5Y8K9freTWszNI0yQH58zhGW3CVBwi3rnZ7Fw8KJDbYZhjKydiS/udxapy+Me',
      'EYUJDqH/BkGIOlPnA8a8mauF1FE53tXx54xG/9O9DlDTA5rPVpOXW4lj+LovARm8',
      'ctSaLxnJojggdk+5lz5NzNah/yYwqAlKF0Po0HfdBNNCUECIaXmRQYvll76uQPDf',
      'aZzhUvXKow9T4jaNjeHXAYaWkKVgUxRcTQJkBQKkJQKBgQD3bVbkLg4FXluidP2I',
      'TeHumRV9J5J+fzHYPqc+NS7Ou/cpfqFDrTQt0iu08tEZ9dfyYhK68Cyp0T6CBwvM',
      'kS24x1IBrZefiA2IaR5zMW4t5S0QuqAeK4xEovH8G8uBMiL5T38rAYqbKlAGN69p',
      'IC7y65nz3lp9/CzogjYrjFyfOwKBgQDKdPHxFkeG1w8wVnh1rkJaRu3Q272GeE3q',
      '07Nydb2G5PsC3hlxlsk1+NWW1wOr6qu3FvmDKKS442QnU7J8sMNt403UD7AFAQZ3',
      'yUjRtJRjZXsg8PUTxVR4QVQbSyteSt5Nj8fqUeQOTa6iI9/cIpmXcYo65NfefiLo',
      'KXWU3vi1bQKBgB3rfedn3lAt4dzaUtJJwLluj5er0l4zmV5x7R1rpvZe6nt9EZky',
      'd63WzWw7NKfz/6IS0/sBEhWS9QEaQwYAxEuk5rjHOh+Tfzdwprr9TjqEjReJydT8',
      'JSEjpyl6XviHjI0jXNhhflZXHogx8ac/ug2sCdjgmYbEmNWg8VYAyi6DAoGBAIXk',
      'XXWBtIAajnL7XOMHAd7Odczg5jCeM3mP1GdoMpWZrd+xnsYeYKePD0KYpFb39eQ6',
      'D32MTZPw3nWbxrjr9fMgloIeddx5Vxu1RLFbaZ9qp8mbUZlnsXtuSP9b8SyE+wv0',
      'gNQYoGhNO6cDbrMZNtaPQkm8un7skI1VjeuMopLpAoGBANd9AOm08gUO1OSgdR5H',
      'GNVhJhHrcUdyp/R9yWvSvJeiWcc4RB0qw+bOHXcH9P0VvRciJfwIgJbryr5nlh0d',
      'q6+xPlKaqSr9E95yj/qW2H1pnzwCCnLj2jn2UzfpQpcIm5MCgAc80ahs/2bqJg3l',
      'P7W+g7Gh5wXw6AkwL5nQDfBw',
      '-----END PRIVATE KEY-----',
      '',
    ].join('\n');

    if (!fs.existsSync(certFile) || fs.readFileSync(certFile, 'utf-8').includes('# Place Cloudflare')) {
      fs.writeFileSync(certFile, defaultCert, 'utf-8');
    }
    if (!fs.existsSync(keyFile) || fs.readFileSync(keyFile, 'utf-8').includes('# Place Cloudflare')) {
      fs.writeFileSync(keyFile, defaultKey, 'utf-8');
    }
  }

  public async applyConfig(appliedBy = 'Sistema'): Promise<{
    version: number;
    yaml: string;
    path: string;
  }> {
    this.ensureCertificatesExist();
    const yamlContent = await this.generateYamlString();

    const targetDir = path.dirname(this.configPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Atomic write using a temp file then rename
    const tempFile = `${this.configPath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, yamlContent, 'utf-8');
    fs.renameSync(tempFile, this.configPath);

    // Sync to Docker volume directly if Traefik is running in Docker and configPath is external/local
    await this.syncToDockerContainer(yamlContent);

    // Save revision in database
    const lastConfig = await prisma.proxyConfiguration.findFirst({
      orderBy: { version: 'desc' },
    });
    const nextVersion = (lastConfig?.version || 0) + 1;

    await prisma.proxyConfiguration.create({
      data: {
        version: nextVersion,
        contentYaml: yamlContent,
        appliedBy,
        status: 'applied',
      },
    });

    return {
      version: nextVersion,
      yaml: yamlContent,
      path: this.configPath,
    };
  }

  private async syncToDockerContainer(yamlContent: string): Promise<boolean> {
    try {
      const docker = await dockerService.getClient();
      const candidateNames = ['domain-manager-api', 'domain-manager-worker'];
      const b64 = Buffer.from(yamlContent, 'utf-8').toString('base64');
      const cmd = `echo '${b64}' | base64 -d > /app/traefik/dynamic/dynamic_conf.yml`;

      for (const name of candidateNames) {
        try {
          const container = docker.getContainer(name);
          const inspect = await container.inspect();
          if (inspect.State?.Running) {
            const exec = await container.exec({
              Cmd: ['sh', '-c', cmd],
              AttachStdout: false,
              AttachStderr: true,
            });
            await exec.start({ Detach: false });
            return true;
          }
        } catch {
          // try next candidate
        }
      }
    } catch (err: any) {
      console.warn(`[TraefikService] Não foi possível sincronizar dynamic_conf.yml via Docker: ${err.message}`);
    }
    return false;
  }

  public getRawConfig(): { yaml: string; exists: boolean } {
    if (fs.existsSync(this.configPath)) {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      return { yaml: content, exists: true };
    }
    return { yaml: '', exists: false };
  }

  public validateYaml(yamlStr: string): { valid: boolean; error?: string } {
    try {
      YAML.parse(yamlStr);
      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  }
}

export const traefikService = new TraefikService();
