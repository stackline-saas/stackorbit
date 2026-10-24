import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { prisma } from '@docker-domain/database';

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
      },
    });

    const defaultService = services.find((s) => s.isDefault);
    const routers: Record<string, any> = {};
    const httpServices: Record<string, any> = {};

    for (const service of services) {
      const traefikServiceName = `service-${service.containerName}`;

      httpServices[traefikServiceName] = {
        loadBalancer: {
          servers: [{ url: `http://${service.containerName}:${service.internalPort}` }],
          passHostHeader: true,
        },
      };

      for (const domain of service.domains) {
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
              url: `http://${defaultService.containerName}:${defaultService.internalPort}`,
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
