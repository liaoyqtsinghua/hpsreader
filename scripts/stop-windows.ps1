$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$port = 4173

Set-Location $root

if (Test-Path ".env") {
  $envLine = Select-String -Path ".env" -Pattern "^PORT=(.+)$" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($envLine) {
    $port = [int]$envLine.Matches[0].Groups[1].Value
  }
}

$connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (!$connections) {
  Write-Host "No HPS Reader process is listening on port $port."
  exit 0
}

$processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($processId in $processIds) {
  Stop-Process -Id $processId -Force
  Write-Host "Stopped process $processId on port $port."
}
