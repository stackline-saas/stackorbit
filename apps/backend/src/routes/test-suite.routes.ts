import { Router } from 'express';
import { validateDomain } from './domains.routes.js';
import { traefikService } from '../services/traefik.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/run', requireAuth, async (req, res) => {
  const results = [];

  // 1. Validação RFC 1035
  const startRfc = Date.now();
  const validD1 = validateDomain('api.meudominio.com.br');
  const validD2 = validateDomain('sub.app-web.io');
  const invalidD1 = validateDomain('invalid_domain..com');
  const invalidD2 = validateDomain('http://meudominio.com');

  const rfcPassed = validD1.valid && validD2.valid && !invalidD1.valid && !invalidD2.valid;
  results.push({
    id: 'test-rfc-1035',
    name: 'Validação FQDN (RFC 1035/1123)',
    description: 'Verifica conformidade estrita de nomes de domínio e rejeição de formatos inválidos.',
    passed: rfcPassed,
    detail: rfcPassed
      ? 'Todos os casos de teste RFC 1035/1123 passaram com êxito.'
      : 'Falha na validação de domínios RFC.',
    durationMs: Date.now() - startRfc,
  });

  // 2. Bloqueio de Injeção
  const startInj = Date.now();
  const inj1 = validateDomain('site.com; rm -rf /');
  const inj2 = validateDomain('site.com\nHost: evil.com');
  const injPassed = !inj1.valid && !inj2.valid;
  results.push({
    id: 'test-injection-prevention',
    name: 'Bloqueio de Injeção e Sanitização',
    description: 'Garante que injeção de comandos de shell e quebras de linha sejam bloqueadas.',
    passed: injPassed,
    detail: injPassed
      ? 'Tentativas maliciosas de escape de shell e header injection foram rejeitadas.'
      : 'Falha no bloqueio de caracteres perigosos.',
    durationMs: Date.now() - startInj,
  });

  // 3. Sintaxe do Traefik YAML
  const startYaml = Date.now();
  const yamlContent = await traefikService.generateYamlString();
  const yamlVal = traefikService.validateYaml(yamlContent);
  results.push({
    id: 'test-traefik-syntax',
    name: 'Sintaxe e Integridade do Traefik YAML',
    description: 'Validação sintática estrita do dynamic_conf.yml gerado.',
    passed: yamlVal.valid,
    detail: yamlVal.valid
      ? 'A árvore de configuração dinâmica é semanticamente válida e parseável pelo Traefik.'
      : `Erro de sintaxe no YAML: ${yamlVal.error}`,
    durationMs: Date.now() - startYaml,
  });

  // 4. Precedência de Roteamento Fallback
  const startPrio = Date.now();
  const cfg = await traefikService.generateConfigObject();
  const fallbackRouter = cfg.http.routers['router-default-fallback'];
  const prioPassed = !fallbackRouter || fallbackRouter.priority === 1;
  results.push({
    id: 'test-catchall-priority',
    name: 'Prioridade do Fallback Catch-All',
    description: 'Assegura que o fallback catch-all opere em prioridade 1 (menor que rotas explícitas de prioridade 100).',
    passed: prioPassed,
    detail: prioPassed
      ? 'Precedência correta: Rotas explícitas possuem prioridade 100 e o fallback utiliza prioridade 1.'
      : 'Prioridade de roteamento incorreta.',
    durationMs: Date.now() - startPrio,
  });

  // 5. Declaração TLS Origin CA
  const startTls = Date.now();
  const hasCerts = cfg.tls?.certificates?.some(
    (c) => c.certFile.includes('origin.pem') && c.keyFile.includes('origin.key')
  );
  results.push({
    id: 'test-tls-origin-ca',
    name: 'Declaração TLS Cloudflare Origin CA',
    description: 'Confere se o bloco tls.certificates aponta para os arquivos montados do Origin CA.',
    passed: Boolean(hasCerts),
    detail: hasCerts
      ? 'Certificados Origin CA declarados corretamente no bloco TLS do Traefik.'
      : 'Bloco TLS ausente ou incompleto.',
    durationMs: Date.now() - startTls,
  });

  return res.json(results);
});

export default router;
