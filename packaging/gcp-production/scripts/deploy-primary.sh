#!/usr/bin/env bash
# Deploy primary API VM: optional GCP provision → write .env → migrate → compose up.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export COMPOSE_FILE=docker-compose.yml
export COMPOSE_GCP_FILE=
export SKIP_BUILD=1
export GCP_CONFIG="${GCP_CONFIG:-${ROOT}/gcp.env}"
SHARED_ENV="${SHARED_ENV:-${ROOT}/shared.env}"

if [[ ! -f "$SHARED_ENV" ]]; then
  echo "Missing $SHARED_ENV — run ./scripts/create-shared-env.sh first." >&2
  exit 1
fi

exec "${ROOT}/scripts/deploy-multi-vm.sh" deploy-primary --shared-env "$SHARED_ENV" "$@"
