#!/usr/bin/env bash
# Logical backup of Postgres to ./backups/ (gzip SQL).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "Missing .env." >&2
  exit 1
fi

mkdir -p "$ROOT/backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$ROOT/backups/colcoor-postgres-${STAMP}.sql.gz"

docker compose -f "$ROOT/docker-compose.yml" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip >"$OUT"

echo "Wrote $OUT"
