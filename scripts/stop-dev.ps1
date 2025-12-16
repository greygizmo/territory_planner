$ErrorActionPreference = "Stop"

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

Write-Host "Stopping ICP Territory Builder dev servers..."
Stop-ListeningPort -Port 8000
Stop-ListeningPort -Port 5174
Write-Host "Done."
