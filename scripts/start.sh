#!/usr/bin/env sh
set -e
cd "$(dirname "$0")/.."
docker build -t pm .
docker rm -f pm >/dev/null 2>&1 || true
ENV_FILE=""
[ -f .env ] && ENV_FILE="--env-file .env"
docker run -d --name pm -p 8000:8000 -v pm-data:/app/data $ENV_FILE pm
echo "Running at http://localhost:8000"
