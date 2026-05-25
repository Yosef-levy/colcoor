#!/usr/bin/env bash
# Create GCS bucket for conversation images and grant objectAdmin to the API service account.
#
# Usage:
#   ./scripts/gcp/provision-gcs.sh --config scripts/gcp/gcp.env --shared-env ./shared.env
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
Usage: provision-gcs.sh --config gcp.env --shared-env PATH [--dry-run]

Uses COLCOOR_GCS_BUCKET and COLCOOR_GCS_SERVICE_ACCOUNT (or first COLCOOR_API_VM_INSTANCES SA).
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

BUCKET="${COLCOOR_GCS_BUCKET:-}"
[[ -n "$BUCKET" ]] || gcp_die "COLCOOR_GCS_BUCKET is required in config"

gcp_run gcloud config set project "$COLCOOR_GCP_PROJECT" >/dev/null

SA="${COLCOOR_GCS_SERVICE_ACCOUNT:-}"
if [[ -z "$SA" && -n "${COLCOOR_API_VM_INSTANCES:-}" ]]; then
  FIRST_VM="${COLCOOR_API_VM_INSTANCES%%,*}"
  SA="$(gcp_vm_service_account "$FIRST_VM")"
fi
[[ -n "$SA" ]] || gcp_die "set COLCOOR_GCS_SERVICE_ACCOUNT or COLCOOR_API_VM_INSTANCES (VM must exist for SA lookup)"

if ! gcp_instance_exists bucket "$BUCKET"; then
  echo "Creating GCS bucket gs://${BUCKET} (${COLCOOR_GCP_REGION})..."
  gcp_run gcloud storage buckets create "gs://${BUCKET}" \
    --project="$COLCOOR_GCP_PROJECT" \
    --location="$COLCOOR_GCP_REGION" \
    --uniform-bucket-level-access
  gcp_run gcloud storage buckets update "gs://${BUCKET}" \
    --public-access-prevention
else
  echo "Bucket gs://${BUCKET} already exists."
fi

echo "Granting roles/storage.objectAdmin to ${SA} on gs://${BUCKET}..."
gcp_run gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SA}" \
  --role="roles/storage.objectAdmin" \
  --quiet

if [[ "$DRY_RUN" == "1" ]]; then
  exit 0
fi

gcp_env_set "$SHARED_ENV" "GCS_BUCKET" "$BUCKET"
gcp_env_set "$SHARED_ENV" "COLCOOR_IMAGE_STORAGE" "gcs"
gcp_env_set "$SHARED_ENV" "COLCOOR_GCS_SERVICE_ACCOUNT" "$SA"

echo "GCS bucket ready: gs://${BUCKET}"
echo "Updated ${SHARED_ENV}"
