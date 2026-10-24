# Docker Domain Manager (PNPM Monorepo: Backend & Worker PaaS)

Plataforma de gerenciamento de containers Docker com proxy reverso dinâmico **Traefik v3**, banco de dados **PostgreSQL 16**, roteamento de múltiplos domínios por container, fallback catch-all inteligente, terminação SSL com **Cloudflare Origin CA (Modo Full strict)**, fila assíncrona **BullMQ + Redis** e **Worker em Segundo Plano** para builds Git e monitoramento de eventos.

---

## 🏗️ Arquitetura da Solução

```text
[ Usuário ] 
    │ (HTTPS / DNS Cloudflare Nuvem Laranja)
    ▼
[ Cloudflare Edge Proxy ] 
    │ (Túnel criptografado com Origin Certificate - Modo Full Strict)
    ▼
[ Servidor VPS :80 / :443 (Traefik v3.1) ]
    ├── Host(`api.empresa.com.br`)    ──[Prioridade 100]──► Container: api:8080
    ├── Host(`admin.empresa.com.br`)  ──[Prioridade 100]──► Container: admin:80
    └── HostRegexp(`{host:.+}`)       ──[Prioridade 1]  ──► Container: web-portal:80 (Fallback Catch-All)
```

### Componentes Principais
1. **Backend REST API (`apps/backend`)**:
   - Autenticação administrativa com JWT e senhas criptografadas em bcrypt.
   - Conexão transparente ao Docker Daemon local (`/var/run/docker.sock`) ou remoto (`DOCKER_HOST=ssh://...` ou TCP).
   - Geração atômica em tempo real do arquivo `traefik/dynamic/dynamic_conf.yml`.
   - Persistência e auditoria completa em **PostgreSQL**.
2. **Background Worker (`apps/worker`)**:
   - **Docker Event Stream**: Escuta eventos de containers (`start`, `stop`, `die`) e atualiza o status no PostgreSQL em tempo real.
   - **Git Build & Deploy Job**: Processa fila BullMQ, clona repositórios Git, valida `Dockerfile`, compila imagens Docker via streaming e recria containers na rede `proxy-net`.
   - **Healthcheck**: Ciclo contínuo a cada 30 segundos verificando a integridade dos containers ativos.
3. **Pacotes Compartilhados (`packages/`)**:
   - `@docker-domain/database`: Modelos Prisma ORM para **PostgreSQL**, cliente tipado e scripts de seed/migração.
   - `@docker-domain/shared`: Tipagens TypeScript compartilhadas, validadores RFC 1035 e catálogo de templates (PostgreSQL, MariaDB, Redis, Adminer, Nginx).
4. **Traefik v3 Dynamic Reverse Proxy**:
   - Roteamento dinâmico sem necessidade de reiniciar o Traefik.
   - Suporte a middlewares de real-IP e cabeçalhos SSL para Cloudflare.

---

## 📁 Estrutura do Monorepo (pnpm workspace)

```text
docker-domain/
├── pnpm-workspace.yaml             # Definição do workspace pnpm (apps/*, packages/*)
├── docker-compose.yml              # Orquestração completa de Produção (Traefik + PostgreSQL + Redis + API + Worker)
├── .env.example                    # Modelo de variáveis de ambiente
├── traefik/
│   ├── traefik.yml                 # Configuração estática do Traefik (entrypoints 80/443 e file provider)
│   ├── dynamic/
│   │   └── dynamic_conf.yml        # Configuração dinâmica gerada atomicamente
│   └── certs/
│       ├── origin.pem              # Certificado Origin CA fornecido pela Cloudflare
│       └── origin.key              # Chave privada do Origin CA
├── packages/
│   ├── database/                   # Camada de persistência PostgreSQL + Prisma
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # Modelos PostgreSQL (User, Service, Domain, ProxyConfig, AuditLog)
│   │   │   └── seed.ts             # Dados iniciais de seed (Admin padrão e serviços)
│   │   └── src/index.ts            # Exportação de prisma, logAudit e tipos
│   └── shared/                     # Tipagens, templates e validações RFC
│       └── src/index.ts
├── apps/
│   ├── backend/                    # API REST Express + Dockerode + Traefik Service
│   │   ├── Dockerfile              # Imagem multi-stage de produção
│   │   └── src/server.ts           # Ponto de entrada Express
│   ├── worker/                     # Background Worker dedicado
│   │   ├── Dockerfile              # Imagem multi-stage de produção
│   │   └── src/index.ts            # Event Stream, BullMQ e Healthchecks
│   └── frontend/                   # Interface SPA moderna em React 19 + Tailwind CSS
└── PLAN.md                         # Especificação técnica do projeto
```

---

## 🚀 Como Executar em Produção na VPS (Docker Compose)

### 1. Clonar e Acessar o Repositório
```bash
git clone <URL_DO_REPOSITORIO> docker-domain
cd docker-domain
```

### 2. Configurar Variáveis de Ambiente e Certificados
```bash
cp .env.example .env

# Coloque seus certificados Origin CA da Cloudflare em:
# traefik/certs/origin.pem
# traefik/certs/origin.key
```

### 3. Iniciar toda a Stack
```bash
docker compose up -d --build
```

O comando irá iniciar:
- `traefik`: Exposto nas portas `80` e `443`.
- `postgres`: Banco de dados PostgreSQL 16 com volume persistente.
- `redis`: Gerenciador de filas em memória BullMQ.
- `api`: Backend REST na porta `3000` (e servindo a SPA compilada).
- `worker`: Background Worker conectado ao Docker Socket e Redis.

### 4. Credenciais Padrão do Administrador
- **URL**: `http://SEU_IP:3000` ou `https://seu-dominio.com`
- **E-mail**: `admin@bla.com.br`
- **Senha**: `admin123`

---

## 💻 Desenvolvimento Local com pnpm

### Pré-requisitos
- Node.js 20+ ou 22+
- `pnpm` (`npm install -g pnpm`)
- Docker Desktop ou Docker Host remoto (mapeado via `DOCKER_HOST`)
- Banco PostgreSQL (local ou em servidor remoto)

### 1. Instalar Dependências e Compilar Pacotes
```bash
pnpm install
pnpm build
```

### 2. Sincronizar e Popular o PostgreSQL
```bash
pnpm db:push
pnpm db:seed
```

### 3. Iniciar os Serviços em Desenvolvimento
```bash
# Terminal 1: Backend API
pnpm dev:backend

# Terminal 2: Background Worker
pnpm dev:worker

# Terminal 3: Frontend SPA (Vite)
pnpm dev:frontend
```

---

## 🧪 Bateria de Testes Automatizados

Executar os testes integrados do Backend contra o PostgreSQL e o Docker Daemon:
```bash
pnpm test:backend
```

Ou através do endpoint administrativo da API:
```bash
POST /api/test-suite/run
Authorization: Bearer <TOKEN>
```
