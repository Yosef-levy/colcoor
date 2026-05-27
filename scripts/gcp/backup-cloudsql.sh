#!/usr/bin/env bash
# Export Cloud SQL Postgres (logical backup via gcloud sql export).
#
# Usage:
#   ./scripts/gcp/backup-cloudsql.sh --config gcp.env
#   ./scripts/gcp/backup-cloudsql.sh --config gcp.env --gcs-uri gs://my-bucket/backups/colcoor-$(date +%Y%m%d).sql.gz
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

CONFIG=""
GCS_URI=""
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: backup-cloudsql.sh --config gcp.env [options]

Options:
  --gcs-uri URI    GCS object URI (default: gs://COLCOOR_GCS_BUCKET/backups/colcoor-YYYYMMDD-HHMMSS.sql.gz)
  --dry-run        Print the gcloud command without running it

Requires: gcloud, Cloud SQL Admin API, bucket write access on the export URI.

Restore (operator responsibility — test on a non-production instance first):
  gcloud sql import sql INSTANCE gs://bucket/path.sql.gz --database=DB_NAME

For point-in-time recovery, enable automated backups on the Cloud SQL instance:
  gcloud sql instances patch INSTANCE --backup-start-time=03:00
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
    --gcs-uri=*)
      GCS_URI="${1#*=}"
      shift
      ;;
    --gcs-uri)
      GCS_URI="${2:-}"
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

gcp_load_config "$CONFIG"
gcp_require_gcloud

INSTANCE="${COLCOOR_CLOUDSQL_INSTANCE:-colcoor-prod}"
POSTGRES_DB="${COLCOOR_POSTGRES_DB:-colcoor}"
BUCKET="${COLCOOR_GCS_BUCKET:-}"
[[ -n "$BUCKET" ]] || gcp_die "COLCOOR_GCS_BUCKET is required in gcp.env (export destination bucket)"

if [[ -z "$GCS_URI" ]]; then
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  GCS_URI="gs://${BUCKET}/backups/colcoor-${stamp}.sql.gz"
fi

echo "Cloud SQL export: instance=${INSTANCE} database=${POSTGRES_DB}"
echo "  destination: ${GCS_URI}"

gcp_run gcloud config set project "$COLCOOR_GCP_PROJECT" >/dev/null

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[dry-run] gcloud sql export sql ${INSTANCE} ${GCS_URI} --database=${POSTGRES_DB} --project=${COLCOOR_GCP_PROJECT}"
  exit 0
fi

gcp_run gcloud sql export sql "$INSTANCE" "$GCS_URI" \
  --database="$POSTGRES_DB" \
  --project="$COLCOOR_GCP_PROJECT"

echo ""
echo "Export complete: ${GCS_URI}"
echo "Verify: gcloud storage ls ${GCS_URI}"
