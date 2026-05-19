#!/usr/bin/env bash
# Start nginx + backend + Postgres (Compose project in bundle root).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "Missing .env. Run ./scripts/01-setup-env.sh first." >&2
  exit 1
fi

if ! docker image inspect colcoor-backend:prod >/dev/null 2>&1; then
  echo "Docker image colcoor-backend:prod not found. Run ./scripts/00-load-image.sh first." >&2
  exit 1
fi
if ! docker image inspect colcoor-pgbouncer:1.23.1 >/dev/null 2>&1; then
  echo "Docker image colcoor-pgbouncer:1.23.1 not found. Run ./scripts/00-load-image.sh first." >&2
  exit 1
fi

docker compose -f "$ROOT/docker-compose.yml" up -d
echo "Stack is up. Check: ./scripts/05-health-check.sh  or re-run ./install-colcoor.sh"
