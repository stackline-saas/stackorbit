import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { db } from './db.ts';
import type { ProxyConfiguration } from '../types/index.ts';

export interface TraefikGenerationResult {
  yaml: string;
  json: Record<string, any>;
  valid: boolean;
  errors: string[];
  routersCount: number;
  servicesCount: number;
  hasDefaultFallback: boolean;
}

class TraefikService {
  private dynamicConfigPath: string;

  constructor() {
    this.dynamicConfigPath = path.resolve(process.cwd(), 'traefik/dynamic/dynamic_conf.yml');
    this.refreshSettings();
  }

  public refreshSettings() {
    const settings = db.getSettings();
    if (settings && settings.traefikDynamicConfigPath) {
      this.dynamicConfigPath = path.resolve(process.cwd(), settings.traefikDynamicConfigPath);
    }
  }

  // Sanitize name for Traefik identifier
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]/g, '-');
  }

  /**
   * Generates Traefik Dynamic Configuration object based on current active Services,
   * active Domains, and default catch-all fallback configuration.
   */
  public generateConfig(): TraefikGenerationResult {
    const services = db.getServices();
    const domains = db.getDomains();
    const settings = db.getSettings();

    const errors: string[] = [];
    const routers: Record<string, any> = {};
    const traefikServices: Record<string, any> = {};

    // 1. Build Service definitions
    for (const svc of services) {
      if (!svc.isActive) continue;

      const svcSlug = `service-${this.slugify(svc.name || svc.containerName)}`;
      const containerHost = svc.containerName || 'localhost';
      const port = svc.internalPort || 80;

      traefikServices[svcSlug] = {
        loadBalancer: {
          servers: [
            {
              url: `http://${containerHost}:${port}`,
            },
          ],
          passHostHeader: true,
          responseForwarding: {
            flushInterval: '100ms',
          },
        },
      };
    }

    // 2. Build Domain Routers: Host(`example.com`)
    let mappedRoutersCount = 0;
    for (const dom of domains) {
      if (!dom.isActive) continue;

      const targetService = services.find((s) => s.id === dom.serviceId);
      if (!targetService) {
        errors.push(`Domínio "${dom.domainName}" aponta para um serviço inexistente (ID: ${dom.serviceId})`);
        continue;
      }

      if (!targetService.isActive) {
        // Skip routing if target service is inactive
        continue;
      }

      const svcSlug = `service-${this.slugify(targetService.name || targetService.containerName)}`;
      const routerSlug = `router-${this.slugify(dom.domainName)}`;

      routers[routerSlug] = {
        rule: `Host(\`${dom.domainName.trim().toLowerCase()}\`)`,
        entryPoints: ['websecure', 'web'],
        service: svcSlug,
        priority: 100,
        middlewares: ['cloudflare-realip'],
        tls: {},
      };
      mappedRoutersCount++;
    }

    // 3. Build Default Fallback Router: HostRegexp(`{host:.+}`)
    let hasDefaultFallback = false;
    const defaultService = services.find((s) => s.isDefault && s.isActive);
    if (defaultService && settings.defaultFallbackEnabled) {
      const defaultSvcSlug = `service-${this.slugify(defaultService.name || defaultService.containerName)}`;

      routers['router-default-fallback'] = {
        rule: 'HostRegexp(`{host:.+}`)',
        entryPoints: ['websecure', 'web'],
        service: defaultSvcSlug,
        priority: 1, // Lowest priority ensures explicit Host rules match first
        middlewares: ['cloudflare-realip'],
        tls: {},
      };
      hasDefaultFallback = true;
    }

    // 4. Middlewares for Cloudflare Origin & Real IP
    const middlewares = {
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
    };

    // 5. TLS Configuration with Cloudflare Origin Certificate
    const tlsConfig = {
      certificates: [
        {
          certFile: '/etc/traefik/certs/origin.pem',
          keyFile: '/etc/traefik/certs/origin.key',
          stores: ['default'],
        },
      ],
      options: {
        default: {
          minVersion: 'VersionTLS12',
          cipherSuites: [
            'TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256',
            'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256',
            'TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384',
            'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384',
            'TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305',
            'TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305',
          ],
          sniStrict: false,
        },
      },
    };

    const finalConfigObject = {
      http: {
        routers,
        services: traefikServices,
        middlewares,
      },
      tls: tlsConfig,
    };

    let yamlString = '';
    let valid = true;
    try {
      const headerComment = [
        '# ===================================================================',
        '# TRAEFIK DYNAMIC CONFIGURATION - DOCKER DOMAIN MANAGER',
        '# Gerado automaticamente pelo Painel Administrativo',
        `# Data de geração: ${new Date().toISOString()}`,
        '# Modo SSL: Cloudflare Full (strict) via Origin CA Certificate',
        '# ===================================================================\n',
      ].join('\n');

      yamlString = headerComment + YAML.stringify(finalConfigObject);
      // Validate by re-parsing
      YAML.parse(yamlString);
    } catch (err: any) {
      valid = false;
      errors.push(`Erro de sintaxe YAML: ${err.message}`);
    }

    return {
      yaml: yamlString,
      json: finalConfigObject,
      valid: valid && errors.length === 0,
      errors,
      routersCount: Object.keys(routers).length,
      servicesCount: Object.keys(traefikServices).length,
      hasDefaultFallback,
    };
  }

  /**
   * Applies the generated configuration by persisting to disk and recording an audit revision.
   */
  public applyConfig(userId = 'system', userName = 'Administrador'): { success: boolean; revision: ProxyConfiguration; error?: string } {
    const generated = this.generateConfig();

    if (!generated.valid && generated.errors.length > 0) {
      return {
        success: false,
        revision: {
          id: `cfg_err_${Date.now()}`,
          version: 0,
          contentYaml: generated.yaml,
          appliedAt: new Date().toISOString(),
          appliedBy: userId,
          appliedByName: userName,
          status: 'failed',
          errorMessage: generated.errors.join('; '),
        },
        error: generated.errors.join('; '),
      };
    }

    try {
      // Write to dynamic configuration file
      const dir = path.dirname(this.dynamicConfigPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dynamicConfigPath, generated.yaml, 'utf-8');

      // Record in DB history
      const revision = db.addProxyConfiguration({
        contentYaml: generated.yaml,
        appliedAt: new Date().toISOString(),
        appliedBy: userId,
        appliedByName: userName,
        status: 'applied',
      });

      // Record in audit log
      db.logAudit({
        userId,
        userName,
        action: 'TRAEFIK_CONFIG_APLICADA',
        entityType: 'PROXY',
        entityId: revision.id,
        details: `Configuração Traefik v${revision.version} gravada com ${generated.routersCount} routers (${generated.hasDefaultFallback ? 'com fallback padrão' : 'sem fallback'}) e ${generated.servicesCount} serviços`,
      });

      return { success: true, revision };
    } catch (err: any) {
      const revision = db.addProxyConfiguration({
        contentYaml: generated.yaml,
        appliedAt: new Date().toISOString(),
        appliedBy: userId,
        appliedByName: userName,
        status: 'failed',
        errorMessage: err.message,
      });

      return { success: false, revision, error: err.message };
    }
  }

  public getDynamicFilePath(): string {
    return this.dynamicConfigPath;
  }
}

export const traefikService = new TraefikService();
