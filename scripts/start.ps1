$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
docker build -t pm .
docker rm -f pm 2>$null
$envArgs = if (Test-Path .env) { @("--env-file", ".env") } else { @() }
docker run -d --name pm -p 8000:8000 -v pm-data:/app/data @envArgs pm
Write-Output "Running at http://localhost:8000"
