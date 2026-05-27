#!/usr/bin/env bash
# Provision Cloud SQL, Memorystore Redis, GCS, and write shared.env (run once).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GCP_CONFIG="${GCP_CONFIG:-${ROOT}/gcp.env}"
SHARED_ENV="${SHARED_ENV:-${ROOT}/shared.env}"

if [[ ! -f "$GCP_CONFIG" ]]; then
  echo "Missing $GCP_CONFIG — copy gcp.env.example to gcp.env and edit." >&2
  exit 1
fi

exec "${ROOT}/scripts/gcp/provision-infra.sh" --config "$GCP_CONFIG" --shared-env "$SHARED_ENV" "$@"
