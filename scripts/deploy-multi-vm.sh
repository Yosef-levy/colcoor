#!/usr/bin/env bash
# Multi-VM Colcoor deployment helper — same backend image, shared Postgres / Redis / GCS.
#
# Typical sequence (see docs/multi-vm-deploy.md):
#   1. Primary VM: edit shared.env (secrets + Cloud SQL / Redis / GCS URLs), then:
#        ./scripts/deploy-multi-vm.sh write-env --role=primary --shared-env ./shared.env
#        ./scripts/deploy-multi-vm.sh migrate --shared-env ./shared.env
#        docker compose -f docker-compose.prod.yml up -d --build
#   2. Replica VM: copy shared.env securely, then:
#        ./scripts/deploy-multi-vm.sh write-env --role=replica --shared-env ./shared.env
#        docker compose -f docker-compose.prod.yml up -d --build
#
# Commands:
#   write-env   Build .env from shared.env + role-specific overrides
#   migrate     One-shot alembic upgrade head (before scaling replicas)
#   extract-shared  Create shared.env from an existing .env (strips per-node keys)
#   role-vars   Print role-specific variables (for debugging)
#   provision-gcp Run scripts/gcp/provision-infra.sh (Cloud SQL, Redis, GCS, pools)
#   deploy-primary  provision (optional) → write-env → migrate → compose up (GCP overlay)
#   deploy-replica  write-env → compose up (replica role)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
COMPOSE_GCP_FILE="${COMPOSE_GCP_FILE:-docker-compose.prod.gcp.yml}"
GCP_CONFIG="${GCP_CONFIG:-${REPO_ROOT}/scripts/gcp/gcp.env}"
SHARED_ENV=""
OUT_ENV="${OUT_ENV:-.env}"
FROM_ENV=""
ROLE=""
SKIP_PROVISION=0
SKIP_MIGRATE=0
SKIP_BUILD=0
WITH_LB=0
DRY_RUN=0

# Per-node keys must not live in shared.env (replicas override these via write-env).
ROLE_KEYS=(
  COLCOOR_NODE_ROLE
  COLCOOR_RUN_MIGRATIONS
  COLCOOR_EVENT_PURGE_SCHEDULER_ENABLED
  COLCOOR_INSTANCE_ID
)

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

Usage:
  deploy-multi-vm.sh write-env --role=primary|replica --shared-env PATH [-o .env]
  deploy-multi-vm.sh migrate --shared-env PATH [--compose-file FILE]
  deploy-multi-vm.sh extract-shared [--from .env] [-o shared.env]
  deploy-multi-vm.sh role-vars --role=primary|replica
  deploy-multi-vm.sh provision-gcp [--config gcp.env] --shared-env PATH [--with-lb] [--dry-run]
  deploy-multi-vm.sh deploy-primary --shared-env PATH [--skip-provision] [--skip-migrate] [--with-lb]
  deploy-multi-vm.sh deploy-replica --shared-env PATH

Environment:
  COMPOSE_FILE      docker compose file (default: docker-compose.prod.yml)
  COMPOSE_GCP_FILE  GCP overlay (default: docker-compose.prod.gcp.yml)
  GCP_CONFIG        default --config for provision-gcp (default: scripts/gcp/gcp.env)
  OUT_ENV           output path for write-env (default: .env in repo root)

Examples:
  ./scripts/deploy-multi-vm.sh extract-shared -o ./shared.env
  ./scripts/deploy-multi-vm.sh write-env --role=primary --shared-env ./shared.env
  ./scripts/deploy-multi-vm.sh migrate --shared-env ./shared.env
  ./scripts/deploy-multi-vm.sh write-env --role=replica --shared-env ./shared.env -o .env
EOF
}

die() {
  echo "deploy-multi-vm.sh: $*" >&2
  exit 1
}

require_shared_env() {
  [[ -n "$SHARED_ENV" ]] || die "--shared-env PATH is required"
  [[ -f "$SHARED_ENV" ]] || die "shared env not found: $SHARED_ENV"
}

parse_common_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --role=*)
        ROLE="${1#*=}"
        shift
        ;;
      --role)
        ROLE="${2:-}"
        shift 2
        ;;
      --shared-env=*)
        SHARED_ENV="${1#*=}"
        shift
        ;;
      --shared-env)
        SHARED_ENV="${2:-}"
        shift 2
        ;;
      --compose-file=*)
        COMPOSE_FILE="${1#*=}"
        shift
        ;;
      --compose-file)
        COMPOSE_FILE="${2:-}"
        shift 2
        ;;
      -o)
        OUT_ENV="${2:-}"
        shift 2
        ;;
      --output=*)
        OUT_ENV="${1#*=}"
        shift
        ;;
      --output)
        OUT_ENV="${2:-}"
        shift 2
        ;;
      --from=*)
        FROM_ENV="${1#*=}"
        shift
        ;;
      --from)
        FROM_ENV="${2:-}"
        shift 2
        ;;
      --config=*)
        GCP_CONFIG="${1#*=}"
        shift
        ;;
      --config)
        GCP_CONFIG="${2:-}"
        shift 2
        ;;
      --with-lb)
        WITH_LB=1
        shift
        ;;
      --skip-provision)
        SKIP_PROVISION=1
        shift
        ;;
      --skip-migrate)
        SKIP_MIGRATE=1
        shift
        ;;
      --skip-build)
        SKIP_BUILD=1
        shift
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        break
        ;;
    esac
  done
}

validate_role() {
  case "$ROLE" in
    primary | replica) ;;
    *) die "invalid --role=$ROLE (expected primary or replica)" ;;
  esac
}

default_instance_id() {
  hostname -s 2>/dev/null || hostname 2>/dev/null || echo "colcoor-node"
}

role_snippet() {
  validate_role
  local instance_id="${COLCOOR_INSTANCE_ID:-$(default_instance_id)}"
  case "$ROLE" in
    primary)
      cat <<EOF
# --- Colcoor node role (generated by deploy-multi-vm.sh) ---
COLCOOR_NODE_ROLE=primary
COLCOOR_RUN_MIGRATIONS=true
COLCOOR_EVENT_PURGE_SCHEDULER_ENABLED=true
COLCOOR_INSTANCE_ID=${instance_id}
EOF
      ;;
    replica)
      cat <<EOF
# --- Colcoor node role (generated by deploy-multi-vm.sh) ---
COLCOOR_NODE_ROLE=replica
COLCOOR_RUN_MIGRATIONS=false
COLCOOR_EVENT_PURGE_SCHEDULER_ENABLED=false
COLCOOR_INSTANCE_ID=${instance_id}
EOF
      ;;
  esac
}

cmd_role_vars() {
  parse_common_args "$@"
  validate_role
  role_snippet
}

filter_shared_lines() {
  local line key
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^[[:space:]]*# ]] || [[ -z "${line//[[:space:]]/}" ]]; then
      printf '%s\n' "$line"
      continue
    fi
    key="${line%%=*}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    local skip=0
    for rk in "${ROLE_KEYS[@]}"; do
      if [[ "$key" == "$rk" ]]; then
        skip=1
        break
      fi
    done
    [[ "$skip" -eq 0 ]] && printf '%s\n' "$line"
  done
}

cmd_extract_shared() {
  parse_common_args "$@"
  local from_env="${FROM_ENV:-${REPO_ROOT}/.env}"
  [[ -f "$from_env" ]] || die "source .env not found: $from_env"

  local out="${SHARED_ENV:-}"
  if [[ -z "$out" ]]; then
    if [[ "$OUT_ENV" != ".env" ]]; then
      out="$OUT_ENV"
    else
      out="${REPO_ROOT}/shared.env"
    fi
  fi

  {
    echo "# Colcoor shared secrets and service URLs (all API VMs must match)."
    echo "# Generated from ${from_env} by deploy-multi-vm.sh extract-shared"
    echo "# Copy this file to replica VMs securely; do not commit."
    echo ""
    filter_shared_lines <"$from_env"
  } >"${out}.tmp"
  mv "${out}.tmp" "$out"
  chmod 600 "$out" 2>/dev/null || true
  echo "Wrote $out"
  echo "Next on primary: ./scripts/deploy-multi-vm.sh write-env --role=primary --shared-env $out"
}

cmd_write_env() {
  parse_common_args "$@"
  require_shared_env
  validate_role

  local out_path="$OUT_ENV"
  [[ "$out_path" != /* ]] && out_path="${REPO_ROOT}/${out_path}"

  {
    echo "# Colcoor VM .env — shared settings + ${ROLE} node overrides"
    echo "# Regenerate: ./scripts/deploy-multi-vm.sh write-env --role=${ROLE} --shared-env ${SHARED_ENV}"
    echo ""
    filter_shared_lines <"$SHARED_ENV"
    echo ""
    role_snippet
  } >"${out_path}.tmp"
  mv "${out_path}.tmp" "$out_path"
  chmod 600 "$out_path" 2>/dev/null || true
  echo "Wrote $out_path (role=${ROLE})"
  echo "  COLCOOR_RUN_MIGRATIONS=$([[ "$ROLE" == primary ]] && echo true || echo false)"
}

cmd_migrate() {
  parse_common_args "$@"
  require_shared_env

  local compose_path="${REPO_ROOT}/${COMPOSE_FILE}"
  [[ -f "$compose_path" ]] || die "compose file not found: $compose_path"

  if ! command -v docker >/dev/null 2>&1; then
    die "docker is required for migrate"
  fi

  local env_source="${REPO_ROOT}/.env"
  [[ -f "$env_source" ]] || env_source="$SHARED_ENV"

  echo "Running one-shot alembic upgrade head (${env_source})..."
  local -a compose_args
  mapfile -t compose_args < <(compose_files)
  (
    cd "$REPO_ROOT"
    set -a
    # shellcheck disable=SC1090
    source "$env_source"
    set +a
    if [[ -z "${DATABASE_MIGRATION_URL:-}" ]]; then
      die "DATABASE_MIGRATION_URL must be set in $env_source (direct Postgres, not PgBouncer)"
    fi
    # backend service loads env_file: .env from compose; override URL for direct Cloud SQL.
    docker compose "${compose_args[@]}" run --rm --no-deps \
      -e COLCOOR_RUN_MIGRATIONS=false \
      -e DATABASE_URL="${DATABASE_MIGRATION_URL}" \
      --entrypoint alembic \
      backend upgrade head
  )
  echo "Migrations complete. Safe to start or restart API replicas with COLCOOR_RUN_MIGRATIONS=false."
}

compose_files() {
  local -a files=(-f "${REPO_ROOT}/${COMPOSE_FILE}")
  if [[ -f "${REPO_ROOT}/${COMPOSE_GCP_FILE}" ]] && grep -q '^PGBOUNCER_POSTGRES_HOST=' "${SHARED_ENV}" 2>/dev/null; then
    files+=(-f "${REPO_ROOT}/${COMPOSE_GCP_FILE}")
  fi
  printf '%s\n' "${files[@]}"
}

cmd_compose_up() {
  require_shared_env
  local -a compose_args
  mapfile -t compose_args < <(compose_files)
  (
    cd "$REPO_ROOT"
    if [[ "$SKIP_BUILD" == "1" ]]; then
      docker compose "${compose_args[@]}" up -d
    else
      docker compose "${compose_args[@]}" up -d --build
    fi
  )
}

cmd_provision_gcp() {
  parse_common_args "$@"
  require_shared_env
  local infra="${REPO_ROOT}/scripts/gcp/provision-infra.sh"
  [[ -x "$infra" ]] || die "missing ${infra}"
  local -a args=(--config "$GCP_CONFIG" --shared-env "$SHARED_ENV")
  [[ "$WITH_LB" == "1" ]] && args+=(--with-lb)
  [[ "${DRY_RUN:-0}" == "1" ]] && args+=(--dry-run)
  "$infra" "${args[@]}"
}

cmd_deploy_primary() {
  parse_common_args "$@"
  require_shared_env
  if [[ "$SKIP_PROVISION" != "1" ]]; then
    cmd_provision_gcp --shared-env "$SHARED_ENV" --config "$GCP_CONFIG" \
      ${WITH_LB:+--with-lb} ${DRY_RUN:+--dry-run}
  fi
  ROLE=primary
  OUT_ENV="${REPO_ROOT}/.env"
  cmd_write_env
  if [[ "$SKIP_MIGRATE" != "1" ]]; then
    cmd_migrate
  fi
  cmd_compose_up
  echo "Primary deploy complete. Verify: curl -fsS http://127.0.0.1/ready"
}

cmd_deploy_replica() {
  parse_common_args "$@"
  require_shared_env
  ROLE=replica
  OUT_ENV="${REPO_ROOT}/.env"
  cmd_write_env
  cmd_compose_up
  echo "Replica deploy complete. Verify: curl -fsS http://127.0.0.1/ready"
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    write-env) cmd_write_env "$@" ;;
    migrate) cmd_migrate "$@" ;;
    extract-shared) cmd_extract_shared "$@" ;;
    role-vars) cmd_role_vars "$@" ;;
    provision-gcp) cmd_provision_gcp "$@" ;;
    deploy-primary) cmd_deploy_primary "$@" ;;
    deploy-replica) cmd_deploy_replica "$@" ;;
    -h | --help | help | "") usage ;;
    *) die "unknown command: $cmd (try --help)" ;;
  esac
}

main "$@"
