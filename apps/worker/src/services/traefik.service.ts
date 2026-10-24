import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { prisma } from '@docker-domain/database';

export interface TargetServer {
  container: string;
  port: number;
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

export function resolveTargetUrl(
  target: TargetServer,
  host?: { endpointUrl?: string; type?: string; isDefault?: boolean } | null
): string {
  if (target.container.startsWith('http://') || target.container.startsWith('https://')) {
    return target.container;
  }

  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(target.container) || target.container.includes('.')) {
    return `http://${target.container}:${target.port}`;
  }

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
    } catch {}

    if (hostAddress && hostAddress !== '127.0.0.1' && hostAddress !== 'localhost') {
      return `http://${hostAddress}:${target.port}`;
    }
  }

  return `http://${target.container}:${target.port}`;
}

export class TraefikService {
  private configPath: string;

  constructor() {
    this.configPath = path.resolve(
      process.cwd(),
      process.env.TRAEFIK_DYNAMIC_CONFIG_PATH || '../../traefik/dynamic/dynamic_conf.yml'
    );
  }

  public async generateConfigObject() {
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
    const routers: Record<string, any> = {};
    const httpServices: Record<string, any> = {};

    for (const service of services) {
      for (const domain of service.domains) {
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

    return {
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
  }

  public async generateYamlString(): Promise<string> {
    const configObj = await this.generateConfigObject();
    const commentHeader = [
      '# ===================================================================',
      '# TRAEFIK DYNAMIC CONFIGURATION - GERADO AUTOMATICAMENTE PELO WORKER',
      `# Gerado em: ${new Date().toISOString()}`,
      '# ===================================================================\n',
    ].join('\n');

    return commentHeader + YAML.stringify(configObj, { indent: 2 });
  }

  public ensureCertificatesExist(): void {
    const certsDir = path.resolve(
      process.cwd(),
      process.env.TRAEFIK_CERTS_DIR || '../../traefik/certs'
    );
    if (!fs.existsSync(certsDir)) {
      fs.mkdirSync(certsDir, { recursive: true });
    }
    const certFile = path.resolve(certsDir, 'origin.pem');
    const keyFile = path.resolve(certsDir, 'origin.key');
    if (!fs.existsSync(certFile)) {
      fs.writeFileSync(certFile, '-----BEGIN CERTIFICATE-----\n# Place Cloudflare Origin CA Certificate here\n-----END CERTIFICATE-----\n', 'utf-8');
    }
    if (!fs.existsSync(keyFile)) {
      fs.writeFileSync(keyFile, '-----BEGIN PRIVATE KEY-----\n# Place Cloudflare Origin CA Private Key here\n-----END PRIVATE KEY-----\n', 'utf-8');
    }
  }

  public async applyConfig(appliedBy = 'Background Worker'): Promise<{
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

    const tempFile = `${this.configPath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, yamlContent, 'utf-8');
    fs.renameSync(tempFile, this.configPath);

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
}

export const traefikService = new TraefikService();
