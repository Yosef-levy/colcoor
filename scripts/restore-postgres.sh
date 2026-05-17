#!/usr/bin/env bash
# Restore Colcoor Postgres from a gzip SQL dump produced by backup-postgres.sh.
#
# DESTRUCTIVE: replaces all data in the target database.
#
# Usage:
#   ./scripts/restore-postgres.sh --file ./backups/colcoor-postgres-YYYYMMDDTHHMMSSZ.sql.gz --confirm
#
# Production safety: also set COLCOOR_RESTORE_CONFIRM=YES when .env has COLCOOR_ENV=production
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/postgres-backup-lib.sh
source "$ROOT/scripts/lib/postgres-backup-lib.sh"

BACKUP_FILE=""
CONFIRM=0
STOP_STACK=0

usage() {
  cat <<'EOF'
Usage: restore-postgres.sh --file PATH.sql.gz --confirm [--stop-stack]

  --file PATH       Backup file from backup-postgres.sh (required)
  --confirm         Required acknowledgement (destructive restore)
  --stop-stack      Stop backend and pgbouncer before restore (recommended)

Environment:
  COMPOSE_FILE                 Compose file (default: docker-compose.prod.yml)
  COLCOOR_RESTORE_CONFIRM=YES  Required when COLCOOR_ENV=production in .env
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      BACKUP_FILE="${2:-}"
      shift 2
      ;;
    --confirm)
      CONFIRM=1
      shift
      ;;
    --stop-stack)
      STOP_STACK=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "--file must point to an existing .sql.gz backup" >&2
  exit 1
fi
if [[ "$CONFIRM" -ne 1 ]]; then
  echo "Refusing to restore without --confirm (this overwrites the database)." >&2
  exit 1
fi

postgres_backup_lib_load_env "$ROOT"
COMPOSE_FILE_PATH="$(postgres_backup_lib_compose_file_path "$ROOT")"
COMPOSE=( "$(postgres_backup_lib_compose_cmd "$ROOT")" )

if [[ "${COLCOOR_ENV:-}" == "production" && "${COLCOOR_RESTORE_CONFIRM:-}" != "YES" ]]; then
  cat >&2 <<'EOF'
Refusing production restore without COLCOOR_RESTORE_CONFIRM=YES.

Example:
  COLCOOR_RESTORE_CONFIRM=YES ./scripts/restore-postgres.sh --file ./backups/....sql.gz --confirm --stop-stack
EOF
  exit 1
fi

if ! postgres_backup_lib_postgres_running "$ROOT"; then
  echo "Postgres container is not running." >&2
  exit 1
fi

gzip -t "$BACKUP_FILE"

echo ""
echo "=== DESTRUCTIVE RESTORE ==="
postgres_backup_lib_print_target "$ROOT"
echo "Backup file:   $(readlink -f "$BACKUP_FILE" 2>/dev/null || echo "$BACKUP_FILE")"
echo "COLCOOR_ENV:   ${COLCOOR_ENV:-<unset>}"
echo ""
echo "This will DROP and recreate database \"${POSTGRES_DB}\" on service \"postgres\"."
echo "All current data in that database will be lost."
echo ""

if [[ "$STOP_STACK" -eq 1 ]]; then
  echo "Stopping backend and pgbouncer ..."
  "${COMPOSE[@]}" stop backend pgbouncer 2>/dev/null || true
fi

echo "Terminating connections and recreating database ${POSTGRES_DB} on postgres ..."
"${COMPOSE[@]}" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<-SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ${POSTGRES_DB};
CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};
SQL

echo "Restoring from $BACKUP_FILE ..."
gunzip -c "$BACKUP_FILE" | "${COMPOSE[@]}" exec -T postgres \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

echo "Verifying ..."
"${COMPOSE[@]}" exec -T postgres \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT COUNT(*) AS users FROM users;"'

if [[ "$STOP_STACK" -eq 1 ]]; then
  echo "Starting backend and pgbouncer ..."
  "${COMPOSE[@]}" up -d pgbouncer backend
fi

echo ""
echo "Restore complete. Verify the API:"
echo "  curl -fsS http://127.0.0.1/ready"
echo ""
echo "If you use GCS for images, ensure bucket objects still exist for conversation_images rows."
