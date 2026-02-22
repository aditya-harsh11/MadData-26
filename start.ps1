# CamerAI Startup Script
# Starts both backend (FastAPI) and frontend (Vite) servers
# Run: powershell -ExecutionPolicy Bypass -File start.ps1

param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  CamerAI - Starting Services               " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Track processes for cleanup
$processes = @()

function Cleanup {
    Write-Host ""
    Write-Host "Shutting down CamerAI..." -ForegroundColor Yellow
    foreach ($proc in $script:processes) {
        if (-not $proc.HasExited) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            Write-Host "  Stopped PID $($proc.Id)" -ForegroundColor DarkGray
        }
    }
    Write-Host "CamerAI stopped." -ForegroundColor Green
}

# Register cleanup on exit
Register-EngineEvent PowerShell.Exiting -Action { Cleanup } | Out-Null
trap { Cleanup; break }

# ── Start Backend ────────────────────────────────────────────────────
if (-not $FrontendOnly) {
    Write-Host "[Backend] Starting FastAPI server on port $BackendPort..." -ForegroundColor Yellow

    $pythonPath = Join-Path $Root "backend\.venv\Scripts\python.exe"
    if (-not (Test-Path $pythonPath)) {
        Write-Host "  ERROR: Python venv not found. Run install.ps1 first." -ForegroundColor Red
        exit 1
    }

    $backendProc = Start-Process -FilePath $pythonPath `
        -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "$BackendPort", "--reload" `
        -WorkingDirectory (Join-Path $Root "backend") `
        -PassThru -NoNewWindow

    $processes += $backendProc
    Write-Host "  Backend PID: $($backendProc.Id)" -ForegroundColor Green
    Write-Host "  API: http://localhost:$BackendPort" -ForegroundColor Cyan
    Write-Host "  Docs: http://localhost:$BackendPort/docs" -ForegroundColor Cyan

    # Wait for backend to be ready
    Write-Host "  Waiting for backend..." -ForegroundColor DarkGray
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$BackendPort/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch { }
    }

    if ($ready) {
        Write-Host "  Backend is ready!" -ForegroundColor Green
    } else {
        Write-Host "  Backend may still be starting (check logs)..." -ForegroundColor Yellow
    }
}

# ── Start Frontend ───────────────────────────────────────────────────
if (-not $BackendOnly) {
    Write-Host ""
    Write-Host "[Frontend] Starting Vite dev server on port $FrontendPort..." -ForegroundColor Yellow

    $frontendDir = Join-Path $Root "frontend"
    if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
        Write-Host "  ERROR: node_modules not found. Run install.ps1 first." -ForegroundColor Red
        exit 1
    }

    $npmPath = (Get-Command npm).Source
    $frontendProc = Start-Process -FilePath $npmPath `
        -ArgumentList "run", "dev", "--", "--port", "$FrontendPort" `
        -WorkingDirectory $frontendDir `
        -PassThru -NoNewWindow

    $processes += $frontendProc
    Write-Host "  Frontend PID: $($frontendProc.Id)" -ForegroundColor Green
    Write-Host "  App: http://localhost:$FrontendPort" -ForegroundColor Cyan
}

# ── Running ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  CamerAI is running!                       " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Dashboard: http://localhost:$FrontendPort" -ForegroundColor White
Write-Host "  API Docs:  http://localhost:$BackendPort/docs" -ForegroundColor White
Write-Host ""
Write-Host "  Press Ctrl+C to stop all services" -ForegroundColor DarkGray
Write-Host ""

# Keep running until interrupted
try {
    while ($true) {
        Start-Sleep -Seconds 5
        # Check if processes are still alive
        foreach ($proc in $processes) {
            if ($proc.HasExited) {
                Write-Host "WARNING: Process $($proc.Id) has exited with code $($proc.ExitCode)" -ForegroundColor Yellow
            }
        }
    }
} finally {
    Cleanup
}
