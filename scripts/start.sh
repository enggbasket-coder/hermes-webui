#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Copy .env.example to .env and edit it first."; exit 1; }
docker compose up -d --build
docker compose ps
echo
echo "Dashboard: http://127.0.0.1:${PORT:-7878}"
