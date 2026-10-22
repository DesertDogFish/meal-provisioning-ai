# Provision Development Script (PowerShell 5.1+)
# Usage: .\dev.ps1 [-Action <start|stop|test|build>]

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet('start', 'stop', 'test', 'build', 'status')]
    [string]$Action = 'status'
)

function Write-Status {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor Red
}

function Start-Services {
    Write-Status "Starting Provision services..."
    
    # Check Docker
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Error "Docker not found. Please install Docker Desktop."
        return
    }
    
    # Check .env file
    if (-not (Test-Path .env)) {
        Write-Status "Creating .env from .env.example..."
        Copy-Item .env.example .env
        $secret = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
        ((Get-Content .env) -replace '^JWT_SECRET=.*', "JWT_SECRET=$secret") | Set-Content .env
        Write-Success "Generated a random JWT_SECRET in .env"
    }
    
    # Start Docker Compose
    Write-Status "Starting Docker containers..."
    docker compose up -d --build
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Services started successfully!"
        Write-Status "Frontend: http://localhost:3000"
        Write-Status "Backend API: http://localhost:8080"
        Write-Status "Swagger UI: http://localhost:8080/swagger-ui.html"
    } else {
        Write-Error "Failed to start services"
    }
}

function Stop-Services {
    Write-Status "Stopping Provision services..."
    docker compose down
    Write-Success "Services stopped"
}

function Run-Tests {
    Write-Status "Running tests..."
    
    # Backend tests
    Write-Status "Running backend tests..."
    Set-Location backend
    mvn test
    $backendResult = $LASTEXITCODE
    Set-Location ..
    
    # Frontend tests
    Write-Status "Running frontend tests..."
    npm test
    $frontendResult = $LASTEXITCODE
    
    if ($backendResult -eq 0 -and $frontendResult -eq 0) {
        Write-Success "All tests passed!"
    } else {
        Write-Error "Some tests failed"
        if ($backendResult -ne 0) { Write-Error "Backend tests failed" }
        if ($frontendResult -ne 0) { Write-Error "Frontend tests failed" }
    }
}

function Build-Project {
    Write-Status "Building project..."
    
    # Build frontend
    Write-Status "Building frontend..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Frontend build failed"
        return
    }
    
    # Build backend
    Write-Status "Building backend..."
    Set-Location backend
    mvn clean package -DskipTests
    $backendResult = $LASTEXITCODE
    Set-Location ..
    
    if ($backendResult -eq 0) {
        Write-Success "Build completed successfully!"
    } else {
        Write-Error "Backend build failed"
    }
}

function Show-Status {
    Write-Status "Checking service status..."
    
    # Check Docker
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Error "Docker not found"
        return
    }
    
    # Check containers
    $containers = docker compose ps
    Write-Host $containers
    
    # Check frontend
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 2 -ErrorAction Stop
        Write-Success "Frontend: UP (http://localhost:3000)"
    } catch {
        Write-Error "Frontend: DOWN"
    }
    
    # Check backend
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/api/v1/meta" -TimeoutSec 2 -ErrorAction Stop
        Write-Success "Backend: UP (http://localhost:8080)"
    } catch {
        Write-Error "Backend: DOWN"
    }
}

# Main
switch ($Action) {
    'start' { Start-Services }
    'stop' { Stop-Services }
    'test' { Run-Tests }
    'build' { Build-Project }
    'status' { Show-Status }
}
