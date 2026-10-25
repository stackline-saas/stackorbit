# 🗓️ Cronograma e Detalhamento das Fases de Implementação

Este documento detalha cada fase de execução da feature de **Dockers Remotos, Multi-Projetos e Roteamento Global**.

---

## 📍 Fase 1: Fundação de Dados e Conexão Dinâmica (Backend Core)
**Meta:** Preparar a base de dados, migrar dados existentes sem impacto e criar o gerenciador de conexões dinâmicas Docker.

### Tarefas
- [x] Atualizar `packages/database/prisma/schema.prisma` com os modelos `Project` e `DockerHost`.
- [x] Adicionar campos `projectId` e `dockerHostId` no modelo `Service`.
- [x] Criar script de migração/seed que cria automaticamente o **"Projeto Principal (Padrão)"** e vincula todos os serviços, domínios e containers atuais a ele.
- [x] Implementar `DockerHostManager` em `apps/backend/src/services/docker-host-manager.ts` (gerenciamento de pool de clientes `Dockerode` por ID do host com suporte a Socket Local e SSH).
- [x] Criar rotas de CRUD de Projetos (`apps/backend/src/routes/projects.routes.ts`).
- [x] Criar rotas de CRUD e Ping de Hosts (`apps/backend/src/routes/hosts.routes.ts`).

### Critérios de Aceite
- [x] `pnpm db:generate` e migração executados sem erros.
- [x] Os serviços atuais continuam funcionando 100% no "Projeto Principal".
- [x] Endpoint `POST /api/hosts/:id/ping` retorna status online e latência de um host conectado via SSH.

---

## 📍 Fase 2: Interface de Projetos e Servidores (Frontend UI)
**Meta:** Permitir ao usuário navegar entre projetos, cadastrar servidores e visualizar onde cada container está rodando.

### Tarefas
- [x] Criar o componente `ProjectSelector` no cabeçalho do painel para alternar entre projetos ou ver visão geral.
- [x] Criar a tela `ProjectsManagementView` para gerenciar projetos (criar, editar, excluir).
- [x] Criar a tela `ProjectHostsView` para gerenciar os servidores do projeto ativo:
  - Cartões de servidores com status em tempo real (Online/Offline, CPU, RAM, Versão do Docker).
  - Modal "Adicionar Servidor" com formulário para conexão SSH (Host, Porta, Usuário, Chave Privada) e botão "Testar Conexão".
- [x] Adicionar etiquetas de servidor nos cards de containers na Dashboard e na lista de serviços (ex: `🏷️ VPS Hetzner 01`).
- [x] Adicionar seletor de Servidor ao criar um novo serviço no formulário de criação.

### Critérios de Aceite
- [x] Alternar de projeto filtra instantaneamente os serviços exibidos.
- [x] Usuário cadastra uma nova VPS via SSH diretamente pela interface e recebe feedback visual de sucesso após o ping.

---

## 📍 Fase 3: Roteamento Global de Domínios no Traefik
**Meta:** Traefik gerenciar e balancear tráfego entre diferentes servidores e múltiplos projetos.

### Tarefas
- [x] Atualizar `apps/backend/src/services/traefik.service.ts` para resolver IPs externos e portas públicas dos nós remotos.
- [x] Implementar suporte a domínios globais que distribuem tráfego entre réplicas em múltiplos servidores/projetos (`loadBalancer.servers`).
- [x] Sincronizar o arquivo dinâmico do Traefik sempre que serviços remotos forem atualizados ou escalados.

### Critérios de Aceite
- [x] Um domínio configurado no painel envia requisições em round-robin entre um servidor local e uma VPS remota.

---

## 📍 Fase 4: Edge Agent Reverso (Servidores Atrás de Firewall / CGNAT)
**Meta:** Conectar servidores locais e caseiros sem necessidade de IP público fixo ou redirecionamento de portas no roteador.

### Tarefas
- [x] Criar pacote/imagem do agente leve (`apps/agent` ou container Docker).
- [x] Implementar WebSocket Gateway no backend (`/ws/agent`) com autenticação via token exclusivo por host.
- [x] Bridge de streaming para converter comandos do Dockerode sobre a conexão WebSocket reversa.
- [x] Na interface, botão "Copiar comando de instalação do agente" com 1 clique:
  ```bash
  docker run -d --name stackorbit-agent --restart=always -v /var/run/docker.sock:/var/run/docker.sock ghcr.io/stackline-saas/agent -token <TOKEN>
  ```

### Critérios de Aceite
- [x] Uma máquina local conectada via agente passa a responder comandos de start/stop e build pelo painel central.

---

## 📍 Fase 5: Orquestração Docker Swarm por Projeto
**Meta:** Suportar clusters Docker Swarm nativos exclusivos por projeto.

### Tarefas
- [x] Adicionar métodos de Swarm no backend (`docker.swarmInit`, `docker.swarmJoin`, `docker.listNodes`).
- [x] Interface para inicializar o cluster Swarm no host Manager com 1 clique.
- [x] Geração de comando e token de Join para adicionar novos nós como Workers.
- [x] Suporte a deploy de Stacks (`docker stack deploy`) e visualização da distribuição de réplicas pelos nós do cluster.

### Critérios de Aceite
- [x] Cluster Swarm inicializado e réplicas distribuídas automaticamente entre Manager e Worker.
