#!/usr/bin/env bash
# Create Memorystore Redis (GCP) and write REDIS_URL to shared.env.
#
# Usage:
#   ./scripts/gcp/provision-redis.sh --config scripts/gcp/gcp.env --shared-env ./shared.env
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
Usage: provision-redis.sh --config gcp.env --shared-env PATH [--dry-run]
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

INSTANCE="${COLCOOR_REDIS_INSTANCE:-colcoor-redis}"
NETWORK="projects/${COLCOOR_GCP_PROJECT}/global/networks/${COLCOOR_GCP_NETWORK}"

gcp_run gcloud config set project "$COLCOOR_GCP_PROJECT" >/dev/null

if ! gcp_instance_exists redis "$INSTANCE"; then
  echo "Creating Memorystore Redis ${INSTANCE} (1 GiB, ${COLCOOR_GCP_REGION})..."
  gcp_run gcloud redis instances create "$INSTANCE" \
    --project="$COLCOOR_GCP_PROJECT" \
    --size=1 \
    --region="$COLCOOR_GCP_REGION" \
    --network="$NETWORK" \
    --redis-version=redis_7_0 \
    --tier=basic
else
  echo "Memorystore instance ${INSTANCE} already exists."
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo "Would write REDIS_URL to ${SHARED_ENV}"
  exit 0
fi

HOST="$(gcloud redis instances describe "$INSTANCE" \
  --region="$COLCOOR_GCP_REGION" --project="$COLCOOR_GCP_PROJECT" \
  --format='value(host)')"
PORT="$(gcloud redis instances describe "$INSTANCE" \
  --region="$COLCOOR_GCP_REGION" --project="$COLCOOR_GCP_PROJECT" \
  --format='value(port)')"
REDIS_URL="redis://${HOST}:${PORT}/0"

gcp_env_set "$SHARED_ENV" "REDIS_URL" "$REDIS_URL"
gcp_env_set "$SHARED_ENV" "COLCOOR_REDIS_INSTANCE" "$INSTANCE"

echo "Redis ready at ${REDIS_URL}"
echo "Updated ${SHARED_ENV}"
