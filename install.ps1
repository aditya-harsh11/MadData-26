# CamerAI Installation Script for Snapdragon X Elite
# Requires: Python 3.11 x64, Node.js 20+, npm
# Run: powershell -ExecutionPolicy Bypass -File install.ps1

param(
    [switch]$SkipModels,
    [switch]$SkipFrontend,
    [switch]$SkipBackend
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  CamerAI Installer - Snapdragon X Elite   " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Check Prerequisites ──────────────────────────────────────────────
function Test-Command($cmd) {
    try { Get-Command $cmd -ErrorAction Stop | Out-Null; return $true }
    catch { return $false }
}

Write-Host "[1/6] Checking prerequisites..." -ForegroundColor Yellow

if (-not (Test-Command "python")) {
    Write-Host "  ERROR: Python not found. Install Python 3.11 x64 from python.org" -ForegroundColor Red
    exit 1
}
$pyVersion = python --version 2>&1
Write-Host "  Python: $pyVersion" -ForegroundColor Green

if (-not (Test-Command "node")) {
    Write-Host "  ERROR: Node.js not found. Install Node.js 20+ from nodejs.org" -ForegroundColor Red
    exit 1
}
$nodeVersion = node --version 2>&1
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green

if (-not (Test-Command "npm")) {
    Write-Host "  ERROR: npm not found." -ForegroundColor Red
    exit 1
}
$npmVersion = npm --version 2>&1
Write-Host "  npm: $npmVersion" -ForegroundColor Green

# ── Backend Setup ────────────────────────────────────────────────────
if (-not $SkipBackend) {
    Write-Host ""
    Write-Host "[2/6] Setting up Python virtual environment..." -ForegroundColor Yellow

    $venvPath = Join-Path $Root "backend\.venv"
    if (-not (Test-Path $venvPath)) {
        python -m venv "$venvPath"
        Write-Host "  Created venv at backend\.venv" -ForegroundColor Green
    } else {
        Write-Host "  Venv already exists" -ForegroundColor Green
    }

    $pipPath = Join-Path $venvPath "Scripts\pip.exe"
    $pythonPath = Join-Path $venvPath "Scripts\python.exe"

    Write-Host ""
    Write-Host "[3/6] Installing Python dependencies..." -ForegroundColor Yellow
    & $pipPath install --upgrade pip | Out-Null
    & $pipPath install -r (Join-Path $Root "backend\requirements.txt")
    Write-Host "  Python dependencies installed" -ForegroundColor Green

    # Create models directory
    $modelsDir = Join-Path $Root "backend\models"
    if (-not (Test-Path $modelsDir)) {
        New-Item -ItemType Directory -Path $modelsDir | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $modelsDir "phi3-mini") | Out-Null
        Write-Host "  Created models directory" -ForegroundColor Green
    }

    # Create database directory
    $dbDir = Join-Path $Root "backend"
    if (-not (Test-Path (Join-Path $dbDir "camerai.db"))) {
        Write-Host "  Database will be created on first run" -ForegroundColor Green
    }
} else {
    Write-Host ""
    Write-Host "[2/6] Skipping backend setup" -ForegroundColor DarkGray
    Write-Host "[3/6] Skipping Python dependencies" -ForegroundColor DarkGray
}

# ── Frontend Setup ───────────────────────────────────────────────────
if (-not $SkipFrontend) {
    Write-Host ""
    Write-Host "[4/6] Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location (Join-Path $Root "frontend")
    npm install
    Pop-Location
    Write-Host "  Frontend dependencies installed" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[4/6] Skipping frontend setup" -ForegroundColor DarkGray
}

# ── Download Models ──────────────────────────────────────────────────
if (-not $SkipModels) {
    Write-Host ""
    Write-Host "[5/6] Downloading AI models..." -ForegroundColor Yellow
    Write-Host "  This may take several minutes depending on your connection." -ForegroundColor DarkGray

    $pythonPath = Join-Path $Root "backend\.venv\Scripts\python.exe"
    $downloadScript = Join-Path $Root "backend\scripts\download_models.py"

    if (Test-Path $downloadScript) {
        & $pythonPath $downloadScript --all
    } else {
        Write-Host "  Model download script not found. Models must be downloaded manually." -ForegroundColor Yellow
        Write-Host "  Place ONNX models in backend\models\" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "[5/6] Skipping model download" -ForegroundColor DarkGray
}

# ── Verify QNN ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "[6/6] Verifying Qualcomm NPU setup..." -ForegroundColor Yellow

$pythonPath = Join-Path $Root "backend\.venv\Scripts\python.exe"
$verifyScript = Join-Path $Root "scripts\verify_qnn.py"

if (Test-Path $pythonPath) {
    try {
        & $pythonPath -c "import onnxruntime as ort; providers = ort.get_available_providers(); print('  Available providers:', ', '.join(providers)); assert 'QNNExecutionProvider' in providers, 'QNN EP not found'" 2>&1
        Write-Host "  QNN Execution Provider: AVAILABLE" -ForegroundColor Green
    } catch {
        Write-Host "  QNN Execution Provider: NOT AVAILABLE (will use CPU fallback)" -ForegroundColor Yellow
        Write-Host "  Install Qualcomm AI Engine Direct SDK for NPU acceleration" -ForegroundColor DarkGray
    }
} else {
    Write-Host "  Cannot verify (venv not found)" -ForegroundColor Yellow
}

# ── Done ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Installation Complete!                    " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start CamerAI:" -ForegroundColor White
Write-Host "  .\start.ps1" -ForegroundColor Green
Write-Host ""
Write-Host "Or start manually:" -ForegroundColor White
Write-Host "  Backend:  cd backend && .\.venv\Scripts\activate && uvicorn app.main:app --host 0.0.0.0 --port 8000" -ForegroundColor DarkGray
Write-Host "  Frontend: cd frontend && npm run dev" -ForegroundColor DarkGray
Write-Host ""
