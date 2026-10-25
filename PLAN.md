# BRIEFING DE ARQUITETURA E DESENVOLVIMENTO: BACKEND & WORKER STACKORBIT

Você é um Engenheiro de Software Sênior especialista em DevOps, Docker Engine, Traefik v3 e Node.js/TypeScript.
Sua missão é desenvolver o **Backend (API REST)** e o **Worker em Segundo Plano** para se integrar a um Frontend SPA já existente em React + Tailwind CSS.

---

## 1. OBJETIVO DO SISTEMA

O sistema é um painel de controle (PaaS leve estilo Coolify/Portainer focado em Traefik) que permite:
1. Conectar-se ao Docker Daemon local da VPS via Unix Socket (`/var/run/docker.sock`).
2. Listar, iniciar, parar, reiniciar containers e abrir um **Web Terminal interativo (`docker exec`)**.
3. Gerenciar domínios e gerar automaticamente o arquivo de roteamento dinâmico do Traefik (`traefik/dynamic/dynamic_conf.yml`) com regras `Host(...)` e fallback catch-all `HostRegexp('{host:.+}')`.
4. Suportar deploy por Imagem Docker (Docker Hub / Registry) ou CI/CD via Git (GitHub/GitLab) com build local automatizado.
5. Um **Worker assíncrono** responsável por processar builds Git demorados, escutar eventos do Docker Socket em tempo real e monitorar a saúde dos containers.

---

## 2. STACK TECNOLÓGICA OBRIGATÓRIA

- **Linguagem**: Node.js com TypeScript (strict mode).
- **Framework Web**: Express ou Fastify.
- **Docker Client**: Biblioteca `dockerode` (com suporte a streaming de logs e comandos interativos via Docker Exec API sobre `/var/run/docker.sock`).
- **Banco de Dados**: SQLite com Prisma ORM ou Drizzle ORM (fácil portabilidade e persistência em volume local).
- **Fila do Worker**: BullMQ com Redis (ou um queue manager assíncrono interno robusto).
- **YAML Engine**: Pacote `yaml` para serialização atômica do arquivo do Traefik.
- **Autenticação**: JWT (JSON Web Tokens) com senhas em bcrypt.

---

## 3. CONTRATO DE API REST (ENDPOINTS ESPERADOS PELO FRONTEND)

Todos os endpoints protegidos exigem o cabeçalho: `Authorization: Bearer <TOKEN>`.

### A. Autenticação (`/api/auth`)
- `POST /api/auth/login`: `{ email, password }` -> Retorna `{ token, user: { id, name, email, role } }`.
- `POST /api/auth/logout`: Invalida o token / sessão.
- `GET /api/auth/me`: Retorna os dados do usuário autenticado.

### B. Dashboard & Métricas (`/api/dashboard`)
- `GET /api/dashboard`: Retorna:
  ```json
  {
    "totalServices": 4,
    "activeServices": 4,
    "totalDomains": 6,
    "activeDomains": 6,
    "runningContainers": 3,
    "stoppedContainers": 1,
    "defaultServiceName": "Landing Page",
    "defaultServiceId": "svc_1",
    "dockerConnected": true,
    "dockerSocketPath": "/var/run/docker.sock",
    "dockerEngineVersion": "27.1.1",
    "dockerIsEmulated": false,
    "recentAuditLogs": [...],
    "lastProxyConfigAppliedAt": "2026-10-21T18:00:00Z",
    "mainDomain": "meudominio.com.br"
  }

  C. Gerenciamento de Serviços Docker (/api/services)
GET /api/services: Lista todos os serviços cadastrados (incluindo domínios vinculados e status atual do container).
GET /api/services/:id: Retorna detalhes completos do serviço (variáveis de ambiente, portas, branch git, etc.).
POST /api/services: Cria um novo serviço.
Campos: name, containerName, internalPort, sourceType ('IMAGE' | 'GITHUB'), image, gitRepoUrl, gitBranch, dockerfilePath, envVars, notes, isDefault, restartPolicy, memoryLimitMb, cpuLimit.
PUT /api/services/:id: Atualiza configurações do serviço, variáveis .env e limites. Se o container já existir, aplica as novas variáveis reiniciando o container com as novas configurações.
DELETE /api/services/:id: Remove o serviço e desvincula os domínios no Traefik.
POST /api/services/:id/start: Executa docker.getContainer(id).start().
POST /api/services/:id/stop: Executa docker.getContainer(id).stop().
POST /api/services/:id/restart: Reinicia o container.
POST /api/services/:id/rebuild: Envia uma tarefa para o Worker clonar o Git, rodar docker build, recriar o container e salvar os logs.
GET /api/services/:id/ssh-info: Retorna instruções de conexão SSH do host e comando docker exec direto.
POST /api/services/:id/exec: Executa um comando dentro do container via Docker Exec API:
Body: { command: "ls -la", shell: "/bin/sh" }
Retorno: { output: "...", exitCode: 0, executionTimeMs: 45 }.
D. Containers Diretos (/api/containers)
GET /api/containers: Consulta direta a docker.listContainers({ all: true }) retornando ID, nomes, imagem, estado, portas e uso de CPU/Memória.
GET /api/containers/:name/logs?tail=100: Retorna os logs do stdout/stderr do container.
POST /api/containers/:nameOrId/exec: Execução de terminal direto em qualquer container do Docker daemon.
E. Domínios & Roteamento (/api/domains)
GET /api/domains: Lista os domínios cadastrados e o serviço ao qual estão vinculados.
POST /api/domains: Cadastra um domínio (domainName, serviceId, isActive).
Ação imediata: Dispara regeneração atômica do dynamic_conf.yml do Traefik.
PUT /api/domains/:id: Atualiza status ou serviço de destino.
DELETE /api/domains/:id: Remove o domínio e remove a rota do Traefik.
POST /api/domains/validate: Valida se o FQDN é válido e se não está duplicado.
F. Serviço Padrão (Catch-All Fallback) (/api/services/default)
POST /api/services/default: Define ou remove o isDefault: true de um serviço. Isso gera a regra Traefik com prioridade 1:
rule: HostRegexp('{host:.+}').
G. Traefik Dynamic Proxy (/api/traefik)
GET /api/traefik/config: Retorna o conteúdo atual de traefik/dynamic/dynamic_conf.yml em formato YAML e JSON parseado.
POST /api/traefik/apply: Força a regravação física do arquivo YAML na pasta compartilhada com o container do Traefik.
H. Cloudflare Origin CA & SSL (/api/cloudflare)
GET /api/cloudflare/status: Retorna o status do certificado Origin CA montado em /etc/traefik/certs/origin.pem e /etc/traefik/certs/origin.key.
POST /api/cloudflare/origin-cert: Salva o Certificado (.pem) e Chave Privada (.key) fornecidos no painel.
4. O WORKER EM SEGUNDO PLANO (BACKGROUND WORKER)
Crie um processo Worker separado (ou fila BullMQ/Redis) para executar as seguintes rotinas:
Docker Event Stream Listener:
Abrir stream em docker.getEvents():
Quando um container sofrer evento die, stop ou start, o worker atualiza o status na tabela services do banco de dados em tempo real.
Git Build & Deploy Job:
Etapas do Job:
Cria diretório temporário /tmp/builds/{serviceId}.
Executa git clone --branch {branch} --depth 1 {repoUrl}.
Lê ou valida o Dockerfile.
Executa docker.buildImage transmitindo logs linha por linha para a tabela build_logs.
Se houver container antigo rodando, para e remove (docker.rm({ force: true })).
Cria e inicia o novo container com as variáveis .env configuradas e na rede do Traefik (proxy-net).
Notifica conclusão e regenera o dynamic_conf.yml.
Healthcheck Ping:
Checar a cada 30 segundos se os containers ativos respondem na porta interna configurada.
5. GERADOR DO ARQUIVO DO TRAEFIK (dynamic_conf.yml)
O backend deve implementar um gerador determinístico que cria o seguinte arquivo YAML:

# ===================================================================
# TRAEFIK DYNAMIC CONFIGURATION - GERADO AUTOMATICAMENTE
# ===================================================================
http:
  routers:
    # Para cada domínio ativo cadastrado:
    router-api-meusite:
      rule: "Host(`api.meudominio.com.br`)"
      entryPoints: ["websecure", "web"]
      service: "service-backend"
      priority: 100
      middlewares: ["cloudflare-realip"]
      tls: {}

    # Roteador Fallback Catch-All (se houver serviço padrão ativo):
    router-default-fallback:
      rule: "HostRegexp(`{host:.+}`)"
      entryPoints: ["websecure", "web"]
      service: "service-landing-page"
      priority: 1
      middlewares: ["cloudflare-realip"]
      tls: {}

  services:
    service-backend:
      loadBalancer:
        servers:
          - url: "http://meu-backend-container:3000"
        passHostHeader: true

  middlewares:
    cloudflare-realip:
      headers:
        customRequestHeaders:
          X-Forwarded-Proto: "https"
        sslProxyHeaders:
          X-Forwarded-Proto: "https"

tls:
  certificates:
    - certFile: "/etc/traefik/certs/origin.pem"
      keyFile: "/etc/traefik/certs/origin.key"
      stores: ["default"]

      6. DOCKER-COMPOSE PARA O AMBIENTE COMPLETO
O backend deve acompanhar o docker-compose.yml pronto para rodar na VPS com:
traefik: Imagem oficial traefik:v3.1, portas 80 e 443 expostas, montando ./traefik/dynamic:/etc/traefik/dynamic:ro e ./traefik/certs:/etc/traefik/certs:ro.
api: O backend Node.js, montando /var/run/docker.sock:/var/run/docker.sock e ./traefik/dynamic:/app/traefik/dynamic:rw.
worker: O worker em segundo plano com acesso ao Docker Socket e Git CLI instalado.
redis: Para a fila do BullMQ.
network: Rede Docker externa compartilhada proxy-net onde todos os containers de clientes se conectam.
7. CRITÉRIOS DE ACEITE E ENTREGÁVEIS
Código TypeScript limpo, modular, com tipagens estritas.
Tratamento adequado de erros do Docker Daemon (ex: container já parado, porta ocupada).
Migrations ou schema do banco de dados (SQLite/Prisma).
Arquivo .env.example com todas as variáveis (porta, segredo JWT, caminho do socket, pasta do Traefik).
Documentação de deploy com os comandos para iniciar tudo com docker compose up -d.