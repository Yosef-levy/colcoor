#!/usr/bin/env bash
# Restore Postgres from ./backups/*.sql.gz (destructive). See docs/backup-and-restore.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export COMPOSE_FILE="$ROOT/docker-compose.yml"
export COLCOOR_REPO_ROOT="$ROOT"
exec "$ROOT/scripts/restore-postgres.sh" "$@"
