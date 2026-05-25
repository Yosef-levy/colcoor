#!/usr/bin/env bash
# Compute and merge PgBouncer / SQLAlchemy pool env vars into shared.env.
#
# Usage:
#   ./scripts/gcp/size-db-pools.sh --shared-env ./shared.env [--api-replicas N] [--web-concurrency N]
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=lib/common.sh
source "$(dirname "$0")/lib/common.sh"

SHARED_ENV=""
API_REPLICAS=""
WEB_CONC=""
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: size-db-pools.sh --shared-env PATH [options]

Options:
  --shared-env PATH       Env file to update (required)
  --api-replicas N        API VM count (default: 2, or COLCOOR_API_REPLICAS)
  --web-concurrency N     Gunicorn workers per VM (default: 2, or WEB_CONCURRENCY)
  --cloudsql-max-conn N   Postgres max_connections cap (default: 100)
  --dry-run               Print values only; do not write file
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --shared-env=*)
      SHARED_ENV="${1#*=}"
      shift
      ;;
    --shared-env)
      SHARED_ENV="${2:-}"
      shift 2
      ;;
    --api-replicas=*)
      API_REPLICAS="${1#*=}"
      shift
      ;;
    --api-replicas)
      API_REPLICAS="${2:-}"
      shift 2
      ;;
    --web-concurrency=*)
      WEB_CONC="${1#*=}"
      shift
      ;;
    --web-concurrency)
      WEB_CONC="${2:-}"
      shift 2
      ;;
    --cloudsql-max-conn=*)
      CLOUDSQL_MAX="${1#*=}"
      shift
      ;;
    --cloudsql-max-conn)
      CLOUDSQL_MAX="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      gcp_die "unknown argument: $1"
      ;;
  esac
done

[[ -n "$SHARED_ENV" ]] || gcp_die "--shared-env is required"

if [[ -f "$SHARED_ENV" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$SHARED_ENV"
  set +a
fi

API_REPLICAS="${API_REPLICAS:-${COLCOOR_API_REPLICAS:-2}}"
WEB_CONC="${WEB_CONC:-${WEB_CONCURRENCY:-2}}"
CLOUDSQL_MAX="${CLOUDSQL_MAX:-${CLOUDSQL_MAX_CONNECTIONS:-100}}"

DB_POOL_SIZE="${DB_POOL_SIZE:-5}"
DB_MAX_OVERFLOW="${DB_MAX_OVERFLOW:-5}"

# Peak client connections to PgBouncer from all API workers.
CLIENTS=$((API_REPLICAS * WEB_CONC * (DB_POOL_SIZE + DB_MAX_OVERFLOW)))
PGBOUNCER_MAX_CLIENT_CONN=$((CLIENTS + 40))
if (( PGBOUNCER_MAX_CLIENT_CONN < 100 )); then
  PGBOUNCER_MAX_CLIENT_CONN=100
fi

# Server pool: stay under Cloud SQL max_connections with headroom for admin/migrate.
RESERVE=5
HEADROOM=15
AVAILABLE=$((CLOUDSQL_MAX - HEADROOM - RESERVE))
if (( AVAILABLE < 10 )); then
  AVAILABLE=10
fi
PGBOUNCER_DEFAULT_POOL_SIZE=$AVAILABLE
if (( PGBOUNCER_DEFAULT_POOL_SIZE > 50 )); then
  PGBOUNCER_DEFAULT_POOL_SIZE=50
fi
PGBOUNCER_RESERVE_POOL_SIZE=$RESERVE

cat <<EOF
# Pool sizing (api_replicas=${API_REPLICAS} web_concurrency=${WEB_CONC} cloudsql_max=${CLOUDSQL_MAX})
WEB_CONCURRENCY=${WEB_CONC}
DB_POOL_SIZE=${DB_POOL_SIZE}
DB_MAX_OVERFLOW=${DB_MAX_OVERFLOW}
PGBOUNCER_MAX_CLIENT_CONN=${PGBOUNCER_MAX_CLIENT_CONN}
PGBOUNCER_DEFAULT_POOL_SIZE=${PGBOUNCER_DEFAULT_POOL_SIZE}
PGBOUNCER_RESERVE_POOL_SIZE=${PGBOUNCER_RESERVE_POOL_SIZE}
# estimated_peak_clients=${CLIENTS}
EOF

if [[ "$DRY_RUN" == "1" ]]; then
  exit 0
fi

gcp_env_set "$SHARED_ENV" "WEB_CONCURRENCY" "$WEB_CONC"
gcp_env_set "$SHARED_ENV" "DB_POOL_SIZE" "$DB_POOL_SIZE"
gcp_env_set "$SHARED_ENV" "DB_MAX_OVERFLOW" "$DB_MAX_OVERFLOW"
gcp_env_set "$SHARED_ENV" "PGBOUNCER_MAX_CLIENT_CONN" "$PGBOUNCER_MAX_CLIENT_CONN"
gcp_env_set "$SHARED_ENV" "PGBOUNCER_DEFAULT_POOL_SIZE" "$PGBOUNCER_DEFAULT_POOL_SIZE"
gcp_env_set "$SHARED_ENV" "PGBOUNCER_RESERVE_POOL_SIZE" "$PGBOUNCER_RESERVE_POOL_SIZE"

echo "Updated pool settings in ${SHARED_ENV}"
