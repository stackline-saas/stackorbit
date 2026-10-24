# Docker Domain Manager (Traefik + Cloudflare Full Strict)

Painel administrativo completo para cadastrar containers Docker e associar domínios a eles, encaminhando o tráfego HTTP/HTTPS automaticamente por meio do proxy reverso **Traefik**, com terminação e proteção SSL gerenciadas pelo **Cloudflare (Origin CA)**.

---

## 🎯 Arquitetura da Solução

```text
[ Usuário ] 
    │ (HTTPS público / Let's Encrypt gerido pela borda)
    ▼
[ Cloudflare Edge (Proxy Nuvem Laranja) ]
    │ (HTTPS criptografado com Cloudflare Origin Certificate - Modo Full strict)
    ▼
[ Servidor de Origem :443 (Traefik v3) ]
    ├── Host(`api.bla.com.br`)          ──[Prioridade 100]──► Container: api:8080
    ├── Host(`admin.bla.com.br`)        ──[Prioridade 100]──► Container: admin:80
    └── HostRegexp(`{host:.+}`)         ──[Prioridade 1]  ──► Container Padrão: web-portal:80 (Fallback)
```

### Principais Pilares:
1. **Traefik Dynamic Provider**: Gera automaticamente o arquivo `dynamic_conf.yml` para rotear cada domínio cadastrado diretamente ao seu container Docker correspondente via rede interna `proxy-net`.
2. **Serviço Padrão (Catch-All)**: Domínios não cadastrados ou acessos diretos por IP caem na regra `HostRegexp('{host:.+}')` com prioridade mínima (`priority: 1`), evitando páginas de erro genéricas.
3. **Cloudflare Full (strict)**: Nenhum cliente Let's Encrypt local ou renovação automática é necessária no host. A comunicação entre o Cloudflare e o Traefik é autenticada através do **Cloudflare Origin CA Certificate**.
4. **Segurança Avançada**:
   - Docker Socket montado como somente leitura (`/var/run/docker.sock:ro`).
   - Nenhuma interpolação em shell/bash (proteção contra injeção de comandos).
   - Senhas criptografadas com derivação PBKDF2 (SHA-512) com salt.
   - Auditoria completa de todas as operações administrativas no sistema.

---

## 📂 Estrutura de Pastas do Projeto

```
.
├── docker-compose.yml              # Orquestração do App, PostgreSQL 16, Traefik v3 e containers
├── Dockerfile                      # Build multi-stage da aplicação Node.js
├── .env.example                    # Modelo de variáveis de ambiente
├── traefik/
│   ├── traefik.yml                 # Configuração estática do Traefik (entrypoints 80/443 e file provider)
│   ├── dynamic/
│   │   └── dynamic_conf.yml        # Configuração dinâmica gerada pelo painel (routers, services, TLS)
│   └── certs/
│       ├── origin.pem              # Certificado Origin CA fornecido pelo Cloudflare
│       └── origin.key              # Chave privada do Origin CA
├── prisma/
│   ├── schema.prisma               # Modelos PostgreSQL (User, Service, Domain, ProxyConfig, AuditLog)
│   └── seed.ts                     # Dados iniciais de seed (admin, serviços e domínios)
├── src/
│   ├── context/
│   │   ├── AuthContext.tsx         # Gestão de sessão, login/logout e token Bearer
│   │   └── NotificationContext.tsx # Notificações e alertas visuais (toasts)
│   ├── components/
│   │   ├── Sidebar.tsx             # Menu lateral responsivo com badges de status
│   │   ├── Header.tsx              # Barra superior com ações rápidas e breadcrumbs
│   │   ├── LoginView.tsx           # Tela de autenticação com dados do seed
│   │   ├── Modals.tsx              # Modais de criação/edição e visualização de logs
│   │   └── views/
│   │       ├── DashboardView.tsx   # Painel com métricas KPI e últimas alterações
│   │       ├── ServicesView.tsx    # CRUD de serviços, controle e logs de containers
│   │       ├── DomainsView.tsx     # Associação de domínios, validação RFC e status
│   │       ├── DefaultServiceView.tsx # Configuração do fallback catch-all e simulador
│   │       ├── ContainersView.tsx  # Inspeção direta do Docker Engine
│   │       ├── TraefikView.tsx     # Editor YAML, validador de sintaxe e revisões
│   │       ├── CloudflareView.tsx  # Parâmetros de origem e guia do Origin CA
│   │       ├── AuditLogsView.tsx   # Trilha cronológica de auditoria e exportação
│   │       ├── TestSuiteView.tsx   # Bateria de testes automatizados do sistema
│   │       └── SettingsView.tsx    # Configurações do socket e proxy
│   ├── server/
│   │   ├── db.ts                   # Camada de persistência local / PostgreSQL
│   │   ├── dockerService.ts        # Integração Docker Engine REST API com fallback
│   │   ├── traefikService.ts       # Gerador dinâmico de YAML do Traefik e validador
│   │   ├── auth.ts                 # Middleware de proteção e validação de sessão
│   │   └── routes.ts               # Endpoints REST padronizados
│   ├── types/
│   │   └── index.ts                # Tipagens TypeScript compartilhadas
│   ├── App.tsx                     # Orquestrador central da interface
│   └── main.tsx                    # Ponto de entrada React 19
└── server.ts                       # Servidor Express Full-Stack com Vite middleware
```

---

## 🚀 Como Executar Localmente

### Opção 1: Execução com Docker Compose (Recomendado para Produção)

1. Clone o repositório e acesse a pasta:
   ```bash
   cd docker-domain-manager
   ```

2. Crie os arquivos de certificado de origem (ou use os modelos gerados):
   ```bash
   mkdir -p traefik/certs traefik/dynamic
   # Coloque seus certificados gerados no Cloudflare em:
   # traefik/certs/origin.pem
   # traefik/certs/origin.key
   ```

3. Inicie toda a stack com Docker Compose:
   ```bash
   docker compose up -d
   ```

4. Acesse o painel administrativo:
   - **URL**: `http://localhost:3000`
   - **E-mail padrão**: `admin@bla.com.br`
   - **Senha padrão**: `admin123`

---

### Opção 2: Execução em Desenvolvimento Local (Node.js)

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Copie o arquivo de variáveis de ambiente:
   ```bash
   cp .env.example .env
   ```

3. Inicie o servidor integrado de desenvolvimento:
   ```bash
   npm run dev
   ```

4. O servidor iniciará na porta `3000`:
   - Frontend React SPA com Vite middlewares
   - API Express completa em `/api/*`
   - Conector Docker Engine no socket `/var/run/docker.sock` (com fallback seguro em ambientes sandbox)

---

## 🛡️ Instruções para Configurar o Cloudflare (Modo Full strict)

1. **DNS**:
   - No painel da Cloudflare, crie os registros DNS do tipo **A** ou **CNAME** apontando para o IP do seu servidor de origem (onde o Traefik está rodando).
   - Certifique-se de que o **Proxy esteja ATIVADO (Nuvem Laranja ☁️)** para os domínios desejados (ex: `api.bla.com.br`, `admin.bla.com.br` e `bla.com.br`).

2. **Gerar Certificado de Origem (Origin CA)**:
   - Acesse **SSL/TLS** > **Origin Server**.
   - Clique em **Create Certificate**.
   - Defina os nomes de host: `bla.com.br` e `*.bla.com.br`.
   - Selecione a validade (ex: 15 anos).
   - Salve o conteúdo do certificado em `traefik/certs/origin.pem`.
   - Salve a chave privada em `traefik/certs/origin.key`.

3. **Definir Modo de Criptografia**:
   - Acesse **SSL/TLS** > **Overview**.
   - Selecione a opção **Full (strict)**.
   - Isso garante que a Cloudflare só estabelecerá conexões seguras com o seu Traefik se o certificado de origem for autêntico.

---

## 📡 Endpoints da API REST

| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Autenticação administrativa com credenciais e retorno de token |
| `POST` | `/api/auth/logout` | Encerramento de sessão e revogação de token |
| `GET` | `/api/auth/me` | Dados do usuário autenticado atual |
| `GET` | `/api/dashboard` | Indicadores KPI, containers ativos/parados e status da conexão |
| `GET` | `/api/services` | Listagem de todos os serviços e seus containers associados |
| `POST` | `/api/services` | Cadastro de novo serviço Docker |
| `PUT` | `/api/services/:id` | Edição de serviço e porta interna |
| `DELETE`| `/api/services/:id` | Remoção de serviço e desvinculação de domínios |
| `POST` | `/api/services/:id/start` | Iniciar container no Docker Engine |
| `POST` | `/api/services/:id/stop` | Parar container no Docker Engine |
| `POST` | `/api/services/:id/restart` | Reiniciar container no Docker Engine |
| `GET` | `/api/services/:id/logs` | Obter logs recentes (STDOUT/STDERR) do container |
| `POST` | `/api/services/:id/build` | Disparar clone, build do Dockerfile e publicação a partir do GitHub |
| `GET` | `/api/services/:id/build-logs`| Obter histórico de build e URL/Secret de webhook do GitHub |
| `POST` | `/api/webhooks/github/:id` | Webhook público para continuous deployment (push-to-deploy) |
| `GET` | `/api/domains` | Listagem de domínios cadastrados |
| `POST` | `/api/domains` | Associação de domínio a um serviço |
| `POST` | `/api/domains/validate` | Validação de FQDN RFC 1035 e verificação de duplicidade |
| `PATCH`| `/api/domains/:id/toggle` | Ativação/Desativação de encaminhamento no Traefik |
| `GET` | `/api/default-service` | Consulta o serviço padrão configurado (Catch-all) |
| `POST` | `/api/default-service` | Define ou altera o serviço padrão (`HostRegexp('{host:.+}')`) |
| `DELETE`| `/api/default-service` | Remove o serviço padrão (requisições desconhecidas dão 404) |
| `GET` | `/api/traefik/preview` | Gera a árvore de configuração dinâmica do Traefik em YAML |
| `POST` | `/api/traefik/apply` | Grava a configuração no arquivo dinâmico e registra auditoria |
| `GET` | `/api/traefik/revisions`| Histórico de revisões aplicadas no Traefik |
| `GET` | `/api/cloudflare` | Parâmetros de origem e modo de criptografia |
| `GET` | `/api/audit` | Trilha cronológica de auditoria do sistema |
| `POST` | `/api/test-suite/run` | Executa a bateria de validações e testes unitários |

---

## 🧪 Bateria de Testes do Sistema

A aplicação inclui uma suíte de testes acessível tanto via endpoint `/api/test-suite/run` quanto pela interface na aba **Testes do Sistema**:
1. **Validação FQDN**: Aceite de domínios válidos conforme RFC 1035/1123 (`api.bla.com.br`).
2. **Bloqueio de Injeção**: Rejeição de strings com protocolos maliciosos, comandos de shell e quebras de linha.
3. **Sintaxe do Traefik**: Validação de integridade semântica e parseamento estrito de YAML.
4. **Prioridade do Serviço Padrão**: Assegura que o fallback utilize prioridade `1`, permitindo que rotas explícitas (prioridade `100`) tenham precedência absoluta.
5. **Declaração TLS Origin**: Confere a declaração dos certificados Cloudflare Origin CA no bloco `tls:`.
