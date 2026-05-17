#!/usr/bin/env bash
# Logical Postgres backup for Colcoor Docker Compose (gzip SQL dump).
#
# Usage (from repo root):
#   ./scripts/backup-postgres.sh
#   COMPOSE_FILE=docker-compose.prod.yml COLCOOR_BACKUP_RETENTION_DAYS=14 ./scripts/backup-postgres.sh
#
# Environment:
#   COMPOSE_FILE              Compose file (default: docker-compose.prod.yml)
#   COLCOOR_BACKUP_DIR        Output directory (default: ./backups)
#   COLCOOR_BACKUP_RETENTION_DAYS  Delete dumps older than N days (default: 14)
#   COLCOOR_BACKUP_OFFSITE    Optional rsync target, e.g. user@backup-host:/var/backups/colcoor/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/postgres-backup-lib.sh
source "$ROOT/scripts/lib/postgres-backup-lib.sh"

BACKUP_DIR="${COLCOOR_BACKUP_DIR:-$ROOT/backups}"
RETENTION_DAYS="${COLCOOR_BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/colcoor-postgres-${STAMP}.sql.gz"
META="$BACKUP_DIR/colcoor-postgres-${STAMP}.meta"

postgres_backup_lib_load_env "$ROOT"
COMPOSE=( "$(postgres_backup_lib_compose_cmd "$ROOT")" )

if ! postgres_backup_lib_postgres_running "$ROOT"; then
  echo "Postgres container is not running. Start the stack first." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
umask 077

echo "=== Postgres backup ==="
postgres_backup_lib_print_target "$ROOT"
echo "Output file:   $OUT"
echo ""

echo "Backing up database ${POSTGRES_DB} (user ${POSTGRES_USER}) via service postgres ..."
"${COMPOSE[@]}" exec -T postgres \
  sh -c 'pg_dump --no-owner --no-acl -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip -9 >"$OUT"

gzip -t "$OUT"
SIZE="$(wc -c <"$OUT" | tr -d ' ')"

{
  echo "created_utc=${STAMP}"
  echo "postgres_db=${POSTGRES_DB}"
  echo "postgres_user=${POSTGRES_USER}"
  echo "bytes=${SIZE}"
  echo "compose_file=${COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"
} >"$META"
chmod 600 "$OUT" "$META"

if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [[ "$RETENTION_DAYS" -gt 0 ]]; then
  find "$BACKUP_DIR" -maxdepth 1 -name 'colcoor-postgres-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete
  find "$BACKUP_DIR" -maxdepth 1 -name 'colcoor-postgres-*.meta' -mtime "+${RETENTION_DAYS}" -delete
fi

if [[ -n "${COLCOOR_BACKUP_OFFSITE:-}" ]]; then
  echo "Copying to offsite: ${COLCOOR_BACKUP_OFFSITE}"
  rsync -av "$OUT" "$META" "${COLCOOR_BACKUP_OFFSITE%/}/"
fi

echo "Backup OK: $OUT (${SIZE} bytes)"
echo "Metadata: $META"
