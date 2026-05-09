$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "data"
$outLog = Join-Path $logDir "server.log"
$errLog = Join-Path $logDir "server.err.log"
$npm = Join-Path (Split-Path (Get-Command node).Source -Parent) "npm.cmd"

Set-Location $root

if (!(Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
}

if (!(Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

$port = 4173
$envLine = Select-String -Path ".env" -Pattern "^PORT=(.+)$" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($envLine) {
  $port = [int]$envLine.Matches[0].Groups[1].Value
}

$listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  Write-Host "HPS Reader already appears to be running at http://localhost:$port"
  exit 0
}

Start-Process -FilePath $npm -ArgumentList @("run", "dev") -WorkingDirectory $root -RedirectStandardOutput $outLog -RedirectStandardError $errLog -WindowStyle Hidden
Start-Sleep -Seconds 3

try {
  Invoke-RestMethod -Uri "http://localhost:$port/api/health" | Out-Null
  Write-Host "HPS Reader running at http://localhost:$port"
  Write-Host "Logs: $outLog"
} catch {
  Write-Host "HPS Reader failed to start. Error log:"
  if (Test-Path $errLog) {
    Get-Content $errLog -Raw
  }
  throw
}
