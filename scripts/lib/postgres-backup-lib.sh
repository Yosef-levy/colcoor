# Shared helpers for Postgres backup/restore scripts (source, do not execute).
# shellcheck shell=bash

postgres_backup_lib_root() {
  if [[ -n "${COLCOOR_REPO_ROOT:-}" ]]; then
    printf '%s\n' "$COLCOOR_REPO_ROOT"
    return
  fi
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  printf '%s\n' "$here"
}

postgres_backup_lib_load_env() {
  local root="$1"
  if [[ ! -f "$root/.env" ]]; then
    echo "Missing $root/.env" >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1091
  source "$root/.env"
  set +a
  : "${POSTGRES_USER:?POSTGRES_USER not set in .env}"
  : "${POSTGRES_DB:?POSTGRES_DB not set in .env}"
}

postgres_backup_lib_compose() {
  local root="$1"
  local file="${COMPOSE_FILE:-$root/docker-compose.prod.yml}"
  if [[ ! -f "$file" ]]; then
    echo "Compose file not found: $file" >&2
    return 1
  fi
  printf '%s\n' "$file"
}

postgres_backup_lib_compose_cmd() {
  local root="$1"
  local compose_file
  compose_file="$(postgres_backup_lib_compose "$root")"
  docker compose -f "$compose_file" --project-directory "$root"
}

postgres_backup_lib_postgres_running() {
  local root="$1"
  postgres_backup_lib_compose_cmd "$root" ps -q postgres 2>/dev/null | grep -q .
}

postgres_backup_lib_compose_file_path() {
  local root="$1"
  postgres_backup_lib_compose "$root"
}

postgres_backup_lib_print_target() {
  local root="$1"
  local compose_file
  compose_file="$(postgres_backup_lib_compose_file_path "$root")"
  echo "Compose file:  ${compose_file}"
  echo "Project dir:   ${root}"
  echo "DB service:    postgres (direct; not PgBouncer)"
  echo "Database:      ${POSTGRES_DB}"
  echo "DB user:       ${POSTGRES_USER}"
}
