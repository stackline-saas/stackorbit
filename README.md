# StackOrbit (PNPM Monorepo: Backend & Worker PaaS)

<div align="center">

![StackOrbit Banner](https://raw.githubusercontent.com/stackline-saas/stackorbit/master/apps/frontend/public/favicon.svg)

### Orquestrador Moderno de Containers, Proxy Reverso Traefik v3 e Load Balancing Multi-Host

[![Release](https://img.shields.io/badge/version-v0.1.0--beta-blue.svg?style=for-the-badge)](https://github.com/stackline-saas/stackorbit/releases)
[![Docker](https://img.shields.io/badge/Docker-Compose_v2-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Traefik](https://img.shields.io/badge/Traefik-v3.1-24A1C1?style=for-the-badge&logo=traefikproxy&logoColor=white)](https://traefik.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/stackline-saas/stackorbit/actions/workflows/ci.yml/badge.svg)](https://github.com/stackline-saas/stackorbit/actions/workflows/ci.yml)
[![GitHub release](https://img.shields.io/github/v/release/stackline-saas/stackorbit?display_name=tag)](https://github.com/stackline-saas/stackorbit/releases)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/stackline-saas?label=Sponsor)](https://github.com/sponsors/stackline-saas)

<p align="center">
  <a href="#-instalação-rápida-em-1-comando">Instalação Rápida</a> •
  <a href="#-recursos-principais">Recursos</a> •
  <a href="#-arquitetura-do-sistema">Arquitetura</a> •
  <a href="#-primeiros-passos--credenciais">Acesso Inicial</a> •
  <a href="#-atualização-do-sistema">Atualização</a> •
  <a href="#-suporte-e-contribuição">Contribuição</a>
</p>

</div>

> English documentation: [docs/README.en.md](docs/README.en.md)

---

## 💡 O que é o StackOrbit?

O **StackOrbit** é uma plataforma PaaS *self-hosted* projetada para simplificar a gestão de microsserviços, roteamento de múltiplos domínios e alta disponibilidade de containers Docker.

Com ele, você transforma qualquer VPS Linux ou servidor bare-metal em um ambiente de produção robusto, com **Traefik v3.1 integrado**, suporte nativo a **Cloudflare SSL Full (Strict)**, balanceamento de carga entre múltiplos nós remotos via SSH, deploys automatizados via Git Webhooks e uma interface gráfica moderna e fluida.

### Para quem é

O StackOrbit foi feito para desenvolvedores, equipes DevOps, agências e provedores de infraestrutura que precisam publicar aplicações Docker em VPS ou servidores próprios sem montar uma plataforma PaaS do zero.

### Indicadores do projeto

Preencha estes indicadores com dados reais para ajudar usuários e patrocinadores a avaliar o projeto:

| Indicador | Valor |
| --- | --- |
| Usuários / instalações conhecidas | A preencher |
| Downloads / pulls de imagens | A preencher |
| GitHub stars | [ver no GitHub](https://github.com/stackline-saas/stackorbit) |
| Forks | [ver no GitHub](https://github.com/stackline-saas/stackorbit/network/members) |
| Empresas usando | A preencher |

Não estimamos números sem telemetria ou evidência pública. Atualize esta tabela a cada release.

---

## ⚡ Instalação Rápida em 1 Comando

O instalador oficial detecta sua distribuição Linux, instala e valida o Docker e Docker Compose, gera chaves criptográficas exclusivas e coloca toda a stack no ar em menos de 2 minutos.

### 🐧 Linux VPS (Ubuntu / Debian / CentOS / AlmaLinux / Rocky)

Execute diretamente no terminal do seu servidor como `root` (ou com `sudo`):

```bash
curl -fsSL https://raw.githubusercontent.com/stackline-saas/stackorbit/master/scripts/install.sh | bash
```

---

### 💻 Windows (PowerShell com Docker Desktop)

Abra o PowerShell como Administrador e execute:

```powershell
irm https://raw.githubusercontent.com/stackline-saas/stackorbit/master/scripts/install.ps1 | iex
```

---

### 🐳 Instalação Manual com Docker Compose

Caso prefira clonar o repositório ou gerenciar você mesmo seu arquivo de configuração:

```bash
# Opção A: Clonar repositório oficial
git clone https://github.com/stackline-saas/stackorbit.git
cd stackorbit

# Opção B: Download direto do compose
mkdir -p /opt/stackorbit && cd /opt/stackorbit
curl -fsSL https://raw.githubusercontent.com/stackline-saas/stackorbit/master/docker-compose.prod.yml -o docker-compose.yml

# Criar .env com credenciais seguras
cat <<EOF > .env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=domainmanager
JWT_SECRET=$(openssl rand -hex 32)
PORT=8088
APP_VERSION=v0.1.0
EOF

# Iniciar containers oficiais
docker compose up -d
```

---

## 🔑 Primeiros Passos & Credenciais Padrão

Assim que o script concluir a instalação, acesse o painel pelo navegador:

| Parâmetro | Valor Padrão |
| :--- | :--- |
| **URL de Acesso** | `http://SEU_IP_OU_DOMINIO:8088` |
| **E-mail do Administrador** | `admin@bla.com.br` |
| **Senha Temporária** | `admin123` |
| **Portas em Uso** | `80` (HTTP), `443` (HTTPS Traefik), `8088` (Painel Web) |

> [!IMPORTANT]
> **Segurança:** Altere imediatamente a senha inicial e o e-mail após o primeiro login navegando em **Configurações do Sistema**.

---

## ✨ Recursos Principais

- 🌐 **Roteamento Dinâmico sem Reinicialização:** Crie, altere e aponte múltiplos domínios e subdomínios para qualquer container instantaneamente usando o file provider do Traefik v3.
- ⚖️ **Load Balancing & Multi-Host Avançado:** Distribua requisições entre réplicas locais ou servidores remotos conectados via SSH seguro. Suporte a algoritmos **Round-Robin**, **Ponderado (Weight)** e **Failover Ativo** com checagem de saúde contínua.
- 🔒 **Terminação SSL Cloudflare Full (Strict):** Compatibilidade total com certificados Origin CA da Cloudflare, permitindo túneis TLS ponta a ponta criptografados sem falhas de verificação de autoridade.
- 🎯 **Fallback Catch-All Inteligente:** Defina um serviço de contingência global para capturar requisições de domínios desconhecidos ou subdomínios órfãos.
- 📦 **Git Deploy Automatizado:** Conecte seus repositórios GitHub / GitLab via Webhooks. O background worker clona, compila e sobe os novos containers sem interromper o tráfego existente.
- 🔄 **Atualização com 1 Clique (Zero Downtime):** Notificação em tempo real de novas versões lançadas no GitHub, com botão de auto-atualização direta no painel web ou via script de linha de comando.
- 📊 **Monitoramento em Tempo Real:** Acompanhe consumo de CPU, Memória, conexões ativas e logs de containers diretamente pela interface web sem precisar abrir o terminal SSH.
- 🛡️ **Auditoria Completa (Audit Logs):** Rastreamento de todas as ações administrativas (criação de serviços, deploys, alteração de DNS, autenticações) salvas no PostgreSQL 16.

---

## 🏗️ Arquitetura do Sistema

```mermaid
flowchart TD
    subgraph Internet ["🌐 Tráfego Externo"]
        User["Clientes / Navegadores"]
        CF["Cloudflare Edge (Origin CA / Full Strict)"]
    end

    subgraph Host ["🖥️ Servidor StackOrbit (Portas 80 / 443 / 8088)"]
        Traefik["Traefik v3.1 (Proxy Reverso)"]
        API["Backend API & SPA Web (:8088)"]
        Worker["Background Worker (BullMQ + Git)"]
        DB[(PostgreSQL 16)]
        Redis[(Redis 7 Cache & Filas)]
        DockerSocket["/var/run/docker.sock"]
    end

    subgraph Nodes ["🌍 Nós Remotos & Containers de Aplicação"]
        C1["Container App 1 (Local)"]
        C2["Container App 2 (Local)"]
        RemoteVPS["VPS Remota (via SSH Agent)"]
    end

    User -->|HTTPS :443| CF
    CF -->|SSL Full Strict| Traefik
    Traefik -->|Roteamento Dinâmico| C1
    Traefik -->|Roteamento Dinâmico| C2
    Traefik -->|Load Balancer| RemoteVPS

    User -->|Painel Web :8088| API
    API --> DB
    API --> Redis
    API --> Traefik
    API --> DockerSocket
    Worker --> DockerSocket
    Worker --> Redis
    Worker --> DB
```

---

## 🔄 Atualização do Sistema

Quando uma nova versão do **StackOrbit** for publicada, você pode atualizá-la de duas formas:

### Opção 1: Diretamente pela Interface Web (Recomendado)
1. Acesse o painel web no menu **Configurações**.
2. No card **"Versão & Atualizações do Sistema"**, caso haja um release novo, clique em **"Atualizar Sistema Agora"**.
3. A stack baixará as novas imagens do GHCR e reiniciará suavemente em segundo plano.

### Opção 2: Pelo Terminal do Servidor (CLI)
```bash
cd /opt/stackorbit
./update.sh
```

---

## 📋 Pré-requisitos de Sistema

- **Sistema Operacional:** Linux x86_64 / arm64 (Ubuntu 20.04+, Debian 11+, CentOS 8+, AlmaLinux, Rocky) ou Windows 10/11 com Docker Desktop.
- **Hardware Mínimo:** 1 vCPU, 1 GB de memória RAM livre, 10 GB de disco.
- **Hardware Recomendado:** 2 vCPUs, 2 GB de RAM ou superior para compilação simultânea de projetos Git.
- **Portas Liberadas no Firewall:**
  - `80/TCP`: HTTP (redirecionado automaticamente para HTTPS pelo Traefik)
  - `443/TCP`: HTTPS (tráfego seguro de aplicações)
  - `8088/TCP`: Interface Administrativa do StackOrbit

---

## 🛠️ Tecnologias Empregadas

- **Linguagem & Runtime:** Node.js 22 LTS, TypeScript 5.6
- **Monorepo Manager:** pnpm 9 workspaces
- **Frontend SPA:** React 19, Tailwind CSS, Lucide Icons, Vite
- **Backend API:** Express, Dockerode, BullMQ, JSON Web Tokens
- **Banco de Dados & ORM:** PostgreSQL 16, Prisma ORM
- **Proxy Reverso:** Traefik v3.1 File Provider & Dynamic Routing
- **Contêineres & Distribuição:** Docker, Docker Compose, GitHub Container Registry (GHCR)

---

## 📄 Licença

Este projeto é distribuído sob a licença [MIT](LICENSE). Você é livre para utilizar, modificar e distribuir comercialmente ou em projetos pessoais.

## 💙 Apoie o desenvolvimento

O StackOrbit é mantido em código aberto. Patrocínios financiam manutenção das releases, correções de segurança, documentação, integrações e suporte à comunidade.

### Como o financiamento será usado

- 40%: manutenção, correções e releases;
- 25%: segurança, testes e atualizações de dependências;
- 20%: documentação, exemplos e onboarding;
- 15%: novas integrações e suporte à comunidade.

Os percentuais são uma meta de transparência e podem ser ajustados conforme as prioridades públicas do roadmap.

### Roadmap público

- [ ] Publicar primeira release estável `v1.0.0`;
- [ ] Ampliar cobertura de testes de backend e integração;
- [ ] Melhorar instalação segura e rotação de credenciais;
- [ ] Adicionar mais provedores de DNS e TLS;
- [ ] Expandir documentação em inglês e exemplos de produção;
- [ ] Publicar métricas de adoção e relatórios de desenvolvimento.

Para apoiar, use o botão [GitHub Sponsors](https://github.com/sponsors/stackline-saas) quando disponível ou abra uma discussão para patrocínio empresarial.
