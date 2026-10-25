# ==============================================================================
#  🚀 STACKORBIT - INSTALADOR WINDOWS / POWERSHELL
# ==============================================================================
#  Execução em comando único no PowerShell:
#  irm https://raw.githubusercontent.com/stackline-saas/stackorbit/master/scripts/install.ps1 | iex
# ==============================================================================

$ErrorActionPreference = 'Stop'

$InstallDir = "C:\stackorbit"
$RepoRaw = "https://raw.githubusercontent.com/stackline-saas/stackorbit/master"
$DefaultPort = 8088
$AppVersion = "v0.1.0"

Write-Host ""
Write-Host "  ███████╗████████╗ █████╗  ██████╗██╗  ██╗ ██████╗ ██████╗ ██████╗ ██╗████████╗" -ForegroundColor Cyan
Write-Host "  ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝██╔═══██╗██╔══██╗██╔══██╗██║╚══██╔══╝" -ForegroundColor Cyan
Write-Host "  ███████╗   ██║   ███████║██║     █████╔╝ ██║   ██║██████╔╝██████╔╝██║   ██║   " -ForegroundColor Cyan
Write-Host "  ╚════██║   ██║   ██╔══██║██║     ██╔═██╗ ██║   ██║██╔══██╗██╔══██╗██║   ██║   " -ForegroundColor Cyan
Write-Host "  ███████║   ██║   ██║  ██║╚██████╗██║  ██╗╚██████╔╝██║  ██║██████╔╝██║   ██║   " -ForegroundColor Cyan
Write-Host "  ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝   ╚═╝   " -ForegroundColor Cyan
Write-Host "                       STACKORBIT - INSTALADOR WINDOWS                          " -ForegroundColor Cyan
Write-Host ""

# 1. Verificar Docker
try {
    $dockerVer = docker --version
    Write-Host "[✓] Docker detectado: $dockerVer" -ForegroundColor Green
} catch {
    Write-Host "[!] Docker não encontrado ou Docker Desktop não está rodando!" -ForegroundColor Red
    Write-Host "    Por favor, instale e inicie o Docker Desktop antes de continuar." -ForegroundColor Yellow
    exit 1
}

# 2. Criar pasta de instalação
if (!(Test-Path -Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Write-Host "[✓] Diretório $InstallDir criado com sucesso." -ForegroundColor Green
}
Set-Location -Path $InstallDir

# 3. Gerar .env se não existir
$EnvFile = Join-Path $InstallDir ".env"
if (!(Test-Path -Path $EnvFile)) {
    $randPass = [System.Guid]::NewGuid().ToString("N")
    $randJwt = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")

    $envContent = @"
APP_VERSION=$AppVersion
PORT=$DefaultPort
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$randPass
POSTGRES_DB=domainmanager
JWT_SECRET=$randJwt
DOCKER_NETWORK=proxy-net
"@
    Set-Content -Path $EnvFile -Value $envContent -Encoding UTF8
    Write-Host "[✓] Arquivo .env configurado com credenciais seguras." -ForegroundColor Green
} else {
    Write-Host "[✓] Arquivo .env existente mantido." -ForegroundColor Green
}

# 4. Baixar docker-compose.prod.yml
$ComposeUrl = "$RepoRaw/docker-compose.prod.yml"
$ComposeFile = Join-Path $InstallDir "docker-compose.yml"
Write-Host "[+] Baixando docker-compose de produção..." -ForegroundColor Blue
Invoke-WebRequest -Uri $ComposeUrl -OutFile $ComposeFile -UseBasicParsing

# 5. Criar rede proxy-net se não existir
$netCheck = docker network ls --filter name=^proxy-net$ --format "{{.Name}}"
if (-not $netCheck) {
    Write-Host "[+] Criando rede Docker proxy-net..." -ForegroundColor Blue
    docker network create proxy-net | Out-Null
}

# 6. Puxar imagens e iniciar stack
Write-Host "[+] Puxando imagens Docker mais recentes do GHCR..." -ForegroundColor Blue
docker compose pull

Write-Host "[+] Inicializando containers em segundo plano..." -ForegroundColor Blue
docker compose up -d

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Green
Write-Host "  🎉 StackOrbit $AppVersion (Beta) Instalado com Sucesso!" -ForegroundColor Green
Write-Host "====================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  🌐 Painel de Controle:   http://localhost:$DefaultPort" -ForegroundColor Cyan
Write-Host "  👤 Usuário Inicial:     admin@bla.com.br" -ForegroundColor Yellow
Write-Host "  🔑 Senha Inicial:       admin123" -ForegroundColor Yellow
Write-Host ""
Write-Host "  📁 Diretório Local:     $InstallDir" -ForegroundColor White
Write-Host "====================================================================" -ForegroundColor Green
Write-Host ""
