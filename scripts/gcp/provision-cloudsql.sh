#!/usr/bin/env bash
# Create Cloud SQL Postgres (GCP) and write connection settings to shared.env.
#
# Usage:
#   ./scripts/gcp/provision-cloudsql.sh --config scripts/gcp/gcp.env --shared-env ./shared.env
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

CONFIG=""
SHARED_ENV=""
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: provision-cloudsql.sh --config gcp.env --shared-env PATH [--dry-run]

Creates (if missing): Cloud SQL Postgres instance, database, user.
Writes: POSTGRES_*, PGBOUNCER_POSTGRES_HOST, DATABASE_URL, DATABASE_MIGRATION_URL
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config=*)
      CONFIG="${1#*=}"
      shift
      ;;
    --config)
      CONFIG="${2:-}"
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
gcp_load_config "$CONFIG"
gcp_require_gcloud

if [[ -f "$SHARED_ENV" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$SHARED_ENV"
  set +a
fi

INSTANCE="${COLCOOR_CLOUDSQL_INSTANCE:-colcoor-prod}"
TIER="${COLCOOR_CLOUDSQL_TIER:-db-custom-2-7680}"
DB_VERSION="${COLCOOR_CLOUDSQL_VERSION:-POSTGRES_16}"
POSTGRES_DB="${COLCOOR_POSTGRES_DB:-colcoor}"
POSTGRES_USER="${COLCOOR_POSTGRES_USER:-colcoor}"
NETWORK="projects/${COLCOOR_GCP_PROJECT}/global/networks/${COLCOOR_GCP_NETWORK}"

# Postgres defaults to ENTERPRISE_PLUS; db-custom-* tiers require ENTERPRISE edition.
EDITION="${COLCOOR_CLOUDSQL_EDITION:-}"
if [[ -z "$EDITION" ]]; then
  case "$TIER" in
    db-perf-optimized-*)
      EDITION="ENTERPRISE_PLUS"
      ;;
    *)
      EDITION="ENTERPRISE"
      ;;
  esac
fi

POSTGRES_PASSWORD="${COLCOOR_POSTGRES_PASSWORD:-${POSTGRES_PASSWORD:-}}"
if [[ -z "$POSTGRES_PASSWORD" ]]; then
  POSTGRES_PASSWORD="$(gcp_random_hex 32)"
fi

gcp_run gcloud config set project "$COLCOOR_GCP_PROJECT" >/dev/null

PEERING_RANGE="google-managed-services-${COLCOOR_GCP_NETWORK}"
if [[ "$DRY_RUN" != "1" ]]; then
  if ! gcloud compute addresses describe "$PEERING_RANGE" --global --project="$COLCOOR_GCP_PROJECT" >/dev/null 2>&1; then
    echo "Allocating VPC peering range ${PEERING_RANGE} for Cloud SQL..."
    gcp_run gcloud compute addresses create "$PEERING_RANGE" \
      --global --purpose=VPC_PEERING --prefix-length=16 \
      --network="$COLCOOR_GCP_NETWORK" --project="$COLCOOR_GCP_PROJECT"
  fi
  if ! gcloud services vpc-peerings list --network="$COLCOOR_GCP_NETWORK" --project="$COLCOOR_GCP_PROJECT" 2>/dev/null \
    | grep -q servicenetworking.googleapis.com; then
    echo "Connecting servicenetworking VPC peering..."
    gcp_run gcloud services vpc-peerings connect \
      --service=servicenetworking.googleapis.com \
      --ranges="$PEERING_RANGE" \
      --network="$COLCOOR_GCP_NETWORK" \
      --project="$COLCOOR_GCP_PROJECT"
    if [[ "$DRY_RUN" != "1" ]]; then
      echo "Waiting 30s for VPC peering to propagate..."
      sleep 30
    fi
  fi
fi

if ! gcp_instance_exists cloudsql "$INSTANCE"; then
  echo "Creating Cloud SQL instance ${INSTANCE} (${EDITION}, ${TIER}, ${COLCOOR_GCP_REGION})..."
  gcp_run gcloud sql instances create "$INSTANCE" \
    --project="$COLCOOR_GCP_PROJECT" \
    --database-version="$DB_VERSION" \
    --edition="$EDITION" \
    --tier="$TIER" \
    --region="$COLCOOR_GCP_REGION" \
    --network="$NETWORK" \
    --no-assign-ip \
    --allocated-ip-range-name="$PEERING_RANGE" \
    --storage-auto-increase \
    --availability-type=zonal \
    --backup-start-time=03:00 \
    --enable-point-in-time-recovery
else
  echo "Cloud SQL instance ${INSTANCE} already exists."
fi

if ! gcloud sql databases describe "$POSTGRES_DB" --instance="$INSTANCE" --project="$COLCOOR_GCP_PROJECT" >/dev/null 2>&1; then
  echo "Creating database ${POSTGRES_DB}..."
  gcp_run gcloud sql databases create "$POSTGRES_DB" --instance="$INSTANCE" --project="$COLCOOR_GCP_PROJECT"
fi

# Reset or create user (idempotent create may fail if exists — then set password).
if gcloud sql users list --instance="$INSTANCE" --project="$COLCOOR_GCP_PROJECT" --format='value(name)' | grep -qx "$POSTGRES_USER"; then
  echo "Updating password for user ${POSTGRES_USER}..."
  gcp_run gcloud sql users set-password "$POSTGRES_USER" \
    --instance="$INSTANCE" --project="$COLCOOR_GCP_PROJECT" \
    --password="$POSTGRES_PASSWORD"
else
  echo "Creating user ${POSTGRES_USER}..."
  gcp_run gcloud sql users create "$POSTGRES_USER" \
    --instance="$INSTANCE" --project="$COLCOOR_GCP_PROJECT" \
    --password="$POSTGRES_PASSWORD"
fi

PRIVATE_IP=""
CONNECTION_NAME=""
if [[ "$DRY_RUN" != "1" ]]; then
  PRIVATE_IP="$(gcloud sql instances describe "$INSTANCE" --project="$COLCOOR_GCP_PROJECT" --format=json \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next((x["ipAddress"] for x in d.get("ipAddresses",[]) if x.get("type")=="PRIVATE"), ""))')"
  [[ -n "$PRIVATE_IP" ]] || gcp_die "Cloud SQL private IP not found; run VPC peering (see docs/ops/gcp-provisioning.md)"
  CONNECTION_NAME="$(gcloud sql instances describe "$INSTANCE" --project="$COLCOOR_GCP_PROJECT" \
    --format='value(connectionName)')"
else
  PRIVATE_IP="10.0.0.0"
  CONNECTION_NAME="${COLCOOR_GCP_PROJECT}:${COLCOOR_GCP_REGION}:${INSTANCE}"
fi

ENC_PASS="$(gcp_urlencode "$POSTGRES_PASSWORD")"
DATABASE_URL="postgresql+asyncpg://${POSTGRES_USER}:${ENC_PASS}@pgbouncer:6432/${POSTGRES_DB}"
DATABASE_MIGRATION_URL="postgresql+psycopg://${POSTGRES_USER}:${ENC_PASS}@${PRIVATE_IP}:5432/${POSTGRES_DB}"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "Would write POSTGRES_* and DATABASE_* to ${SHARED_ENV}"
  exit 0
fi

gcp_env_set "$SHARED_ENV" "POSTGRES_DB" "$POSTGRES_DB"
gcp_env_set "$SHARED_ENV" "POSTGRES_USER" "$POSTGRES_USER"
gcp_env_set "$SHARED_ENV" "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
gcp_env_set "$SHARED_ENV" "COLCOOR_POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
gcp_env_set "$SHARED_ENV" "PGBOUNCER_POSTGRES_HOST" "$PRIVATE_IP"
gcp_env_set "$SHARED_ENV" "PGBOUNCER_POSTGRES_PORT" "5432"
gcp_env_set "$SHARED_ENV" "CLOUD_SQL_CONNECTION_NAME" "$CONNECTION_NAME"
gcp_env_set "$SHARED_ENV" "DATABASE_URL" "$DATABASE_URL"
gcp_env_set "$SHARED_ENV" "DATABASE_MIGRATION_URL" "$DATABASE_MIGRATION_URL"
gcp_env_set "$SHARED_ENV" "COLCOOR_CLOUDSQL_INSTANCE" "$INSTANCE"

echo "Cloud SQL ready. Private IP=${PRIVATE_IP} connection=${CONNECTION_NAME}"
echo "Updated ${SHARED_ENV}"
