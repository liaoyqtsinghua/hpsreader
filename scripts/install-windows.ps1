$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (!(Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required. Please install Node.js 20+ first."
}

npm install

if (!(Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

Write-Host ""
Write-Host "HPS Reader installed."
Write-Host "Edit .env and set DEEPSEEK_API_KEY before using DeepSeek."
Write-Host "Then run: powershell -ExecutionPolicy Bypass -File scripts/start-windows.ps1"
