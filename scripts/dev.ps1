$ErrorActionPreference = "Stop"

function Wait-ForHttpOk {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$TimeoutSeconds = 180
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) { return $true }
    }
    catch {
      # ignore and retry
    }
    Start-Sleep -Seconds 2
  }

  return $false
}

function Stop-ListeningPort {
  param(
    [Parameter(Mandatory = $true)][int]$Port
  )

  $pids = @()

  if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    $pids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  }
  else {
    $matches = netstat -ano | Select-String -Pattern (":$Port\s") -ErrorAction SilentlyContinue
    foreach ($m in $matches) {
      if ($m.Line -notmatch "LISTENING") { continue }
      $parts = ($m.Line -split "\s+") | Where-Object { $_ -ne "" }
      if ($parts.Count -lt 2) { continue }
      $processId = $parts[-1]
      if ($processId -match "^\d+$") { $pids += [int]$processId }
    }
    $pids = $pids | Select-Object -Unique
  }

  foreach ($processId in $pids) {
    if (-not $processId) { continue }
    if ($processId -eq $PID) { continue }
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host "Stopped PID $processId on port $Port"
    }
    catch {
      Write-Warning "Failed stopping PID $processId on port ${Port}: $($_.Exception.Message)"
    }
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "territory_tool\\backend"
$frontendDir = Join-Path $repoRoot "territory_tool\\frontend"

if (-not (Test-Path $backendDir)) { throw "Backend folder not found: $backendDir" }
if (-not (Test-Path $frontendDir)) { throw "Frontend folder not found: $frontendDir" }

Write-Host "Restarting ICP Territory Builder dev servers..."
Write-Host "Repo root: $repoRoot"

# Stop existing listeners to avoid confusing port conflicts
Stop-ListeningPort -Port 8000
Stop-ListeningPort -Port 5174

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "python was not found on PATH. Install Python 3.11+ or add it to PATH."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm was not found on PATH. Install Node.js 18+ (includes npm)."
}

Write-Host "Starting backend (http://localhost:8000)..."
$backendCmd = '$Host.UI.RawUI.WindowTitle = "ICP Backend"; python main.py'
Start-Process -FilePath "powershell" -WorkingDirectory $backendDir -ArgumentList @("-NoExit", "-Command", $backendCmd) | Out-Null

Write-Host "Starting frontend (http://localhost:5174)..."
$frontendCmd = '$Host.UI.RawUI.WindowTitle = "ICP Frontend"; npm run dev'
Start-Process -FilePath "powershell" -WorkingDirectory $frontendDir -ArgumentList @("-NoExit", "-Command", $frontendCmd) | Out-Null

Write-Host "Waiting for backend to become ready (this can take ~1 minute on first load)..."
if (-not (Wait-ForHttpOk -Url "http://127.0.0.1:8000/health" -TimeoutSeconds 180)) {
  Write-Warning "Backend didn't become ready within 180 seconds. Check the 'ICP Backend' window for errors."
}

Write-Host "Waiting for frontend to become ready..."
if (-not (Wait-ForHttpOk -Url "http://localhost:5174" -TimeoutSeconds 60)) {
  Write-Warning "Frontend didn't become ready within 60 seconds. Check the 'ICP Frontend' window for errors."
}

Start-Process "http://localhost:5174" | Out-Null

Write-Host "Done. If the browser doesn't load immediately, wait ~10s and refresh."
