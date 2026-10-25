#!/usr/bin/env bash
# ==============================================================================
#  🚀 STACKORBIT - SCRIPT OFICIAL DE INSTALAÇÃO (LINUX / VPS)
# ==============================================================================
#  Execução em comando único:
#  curl -fsSL https://raw.githubusercontent.com/stackline-saas/stackorbit/master/scripts/install.sh | bash
# ==============================================================================

set -e

# Cores e Formatação
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

INSTALL_DIR="/opt/stackorbit"
REPO_RAW="https://raw.githubusercontent.com/stackline-saas/stackorbit/master"
DEFAULT_PORT="8088"
APP_VERSION="v0.1.2"

echo -e "${CYAN}"
echo "  ███████╗████████╗ █████╗  ██████╗██╗  ██╗ ██████╗ ██████╗ ██████╗ ██╗████████╗"
echo "  ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝██╔═══██╗██╔══██╗██╔══██╗██║╚══██╔══╝"
echo "  ███████╗   ██║   ███████║██║     █████╔╝ ██║   ██║██████╔╝██████╔╝██║   ██║   "
echo "  ╚════██║   ██║   ██╔══██║██║     ██╔═██╗ ██║   ██║██╔══██╗██╔══██╗██║   ██║   "
echo "  ███████║   ██║   ██║  ██║╚██████╗██║  ██╗╚██████╔╝██║  ██║██████╔╝██║   ██║   "
echo "  ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝   ╚═╝   "
echo "                       STACKORBIT - INSTALADOR OFICIAL                          "
echo -e "${NC}"

echo -e "${BLUE}==>${NC} Iniciando verificação e preparação do sistema..."

# 1. Verificar permissões de Root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[!] Erro:${NC} Execute este instalador com privilégios de root (sudo bash ou como root)."
  exit 1
fi

# 2. Instalar ferramentas básicas necessárias (curl, openssl, tar)
if ! command -v curl &> /dev/null || ! command -v openssl &> /dev/null; then
  echo -e "${YELLOW}[+]${NC} Instalando ferramentas utilitárias básicas (curl, openssl)..."
  if command -v apt-get &> /dev/null; then
    apt-get update -qq && apt-get install -y -qq curl openssl > /dev/null 2>&1
  elif command -v yum &> /dev/null; then
    yum install -y curl openssl > /dev/null 2>&1
  elif command -v dnf &> /dev/null; then
    dnf install -y curl openssl > /dev/null 2>&1
  elif command -v apk &> /dev/null; then
    apk add --no-cache curl openssl > /dev/null 2>&1
  fi
fi

# 3. Verificar / Instalar Docker e Docker Compose
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}[+]${NC} Docker não encontrado no sistema. Instalando Docker oficial via get.docker.com..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker > /dev/null 2>&1 || service docker start > /dev/null 2>&1
  echo -e "${GREEN}[✓]${NC} Docker instalado com sucesso."
else
  echo -e "${GREEN}[✓]${NC} Docker encontrado: $(docker --version)"
fi

# Verificar Docker Compose
if ! docker compose version &> /dev/null; then
  echo -e "${YELLOW}[+]${NC} Docker Compose plugin não encontrado. Instalando..."
  if command -v apt-get &> /dev/null; then
    apt-get update -qq && apt-get install -y -qq docker-compose-plugin > /dev/null 2>&1
  else
    echo -e "${RED}[!]${NC} Não foi possível instalar docker-compose-plugin automaticamente. Verifique sua instalação do Docker."
    exit 1
  fi
fi
echo -e "${GREEN}[✓]${NC} Docker Compose disponível."

# 4. Criar diretório de instalação
echo -e "${BLUE}==>${NC} Configurando diretório de instalação em ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"
cd "${INSTALL_DIR}"

# 5. Gerar arquivo .env seguro se não existir
if [ ! -f "${INSTALL_DIR}/.env" ]; then
  echo -e "${YELLOW}[+]${NC} Gerando credenciais criptográficas seguras em .env..."
  RANDOM_DB_PASS=$(openssl rand -hex 16 2>/dev/null || tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c 32)
  RANDOM_JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c 64)

  cat <<EOF > "${INSTALL_DIR}/.env"
# Configurações do StackOrbit
APP_VERSION=${APP_VERSION}
PORT=${DEFAULT_PORT}
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${RANDOM_DB_PASS}
POSTGRES_DB=domainmanager
JWT_SECRET=${RANDOM_JWT_SECRET}
DOCKER_NETWORK=proxy-net
EOF
  chmod 600 "${INSTALL_DIR}/.env"
  echo -e "${GREEN}[✓]${NC} Arquivo .env gerado com sucesso."
else
  echo -e "${GREEN}[✓]${NC} Arquivo .env já existente mantido com segurança."
  # Atualizar APP_VERSION no .env para a nova versão da release
  if grep -q "APP_VERSION=" "${INSTALL_DIR}/.env"; then
    sed -i "s/APP_VERSION=.*/APP_VERSION=${APP_VERSION}/" "${INSTALL_DIR}/.env"
  else
    echo "APP_VERSION=${APP_VERSION}" >> "${INSTALL_DIR}/.env"
  fi
fi

# 6. Baixar docker-compose.yml de produção
echo -e "${BLUE}==>${NC} Baixando configuração oficial dos containers..."
curl -fsSL "${REPO_RAW}/docker-compose.prod.yml" -o "${INSTALL_DIR}/docker-compose.yml"

# 7. Baixar script de atualização (update.sh)
curl -fsSL "${REPO_RAW}/scripts/update.sh" -o "${INSTALL_DIR}/update.sh"
chmod +x "${INSTALL_DIR}/update.sh"

# 8. Criar rede Docker proxy-net se não existir
if ! docker network inspect proxy-net &> /dev/null; then
  echo -e "${YELLOW}[+]${NC} Criando rede Docker externa 'proxy-net'..."
  docker network create proxy-net > /dev/null 2>&1
fi

# 9. Puxar imagens e iniciar serviços
echo -e "${BLUE}==>${NC} Puxando imagens Docker do GitHub Container Registry (GHCR)..."
docker compose pull

echo -e "${BLUE}==>${NC} Iniciando stack do StackOrbit..."
docker compose up -d

# 10. Descobrir IP do Servidor
SERVER_IP=$(curl -s -4 https://ifconfig.me 2>/dev/null || curl -s -4 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "SEU_IP_DO_SERVIDOR")

echo ""
echo -e "${GREEN}====================================================================${NC}"
echo -e "${BOLD}${GREEN}  🎉 StackOrbit ${APP_VERSION} (Beta) Instalado com Sucesso!${NC}"
echo -e "${GREEN}====================================================================${NC}"
echo ""
echo -e "  ${BOLD}🌐 Painel de Controle:${NC}   ${CYAN}http://${SERVER_IP}:${DEFAULT_PORT}${NC}"
echo -e "  ${BOLD}👤 Usuário Inicial:${NC}     ${YELLOW}admin@bla.com.br${NC}"
echo -e "  ${BOLD}🔑 Senha Inicial:${NC}       ${YELLOW}admin123${NC} (Altere no primeiro login!)"
echo ""
echo -e "  ${BOLD}📁 Diretório Local:${NC}     ${INSTALL_DIR}"
echo -e "  ${BOLD}🔄 Para Atualizar:${NC}      cd ${INSTALL_DIR} && ./update.sh"
echo -e "                        (ou com 1 clique pela tela de Configurações!)"
echo ""
echo -e "${GREEN}====================================================================${NC}"
echo ""
