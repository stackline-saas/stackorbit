#!/usr/bin/env bash
# ==============================================================================
#  🔄 DOCKER DOMAIN MANAGER - SCRIPT DE ATUALIZAÇÃO (CLI)
# ==============================================================================
#  Atualiza a stack para a versão mais recente sem perda de dados.
# ==============================================================================

set -e

INSTALL_DIR="${DOCKER_DOMAIN_DIR:-/opt/docker-domain}"
if [ ! -d "$INSTALL_DIR" ]; then
  INSTALL_DIR="$(pwd)"
fi

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BLUE}==>${NC} Verificando diretório ${INSTALL_DIR}..."
cd "${INSTALL_DIR}"

if [ ! -f "docker-compose.yml" ]; then
  echo -e "${YELLOW}[!]${NC} docker-compose.yml não encontrado em ${INSTALL_DIR}."
  exit 1
fi

echo -e "${BLUE}==>${NC} Baixando imagens mais recentes do GitHub Container Registry (GHCR)..."
docker compose pull

echo -e "${BLUE}==>${NC} Reiniciando serviços com as novas imagens..."
docker compose up -d --remove-orphans

echo -e "${BLUE}==>${NC} Limpando imagens antigas e não utilizadas..."
docker image prune -f > /dev/null 2>&1 || true

echo ""
echo -e "${GREEN}====================================================================${NC}"
echo -e "${BOLD}${GREEN}  ✓ Docker Domain Manager atualizado com sucesso!${NC}"
echo -e "${GREEN}====================================================================${NC}"
echo ""
