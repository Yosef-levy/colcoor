#!/usr/bin/env bash
# Deploy replica API VM: write .env (no migrations) → compose up.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export COMPOSE_FILE=docker-compose.yml
export COMPOSE_GCP_FILE=
export SKIP_BUILD=1
SHARED_ENV="${SHARED_ENV:-${ROOT}/shared.env}"

if [[ ! -f "$SHARED_ENV" ]]; then
  echo "Missing $SHARED_ENV — copy from primary VM securely." >&2
  exit 1
fi

exec "${ROOT}/scripts/deploy-multi-vm.sh" deploy-replica --shared-env "$SHARED_ENV" "$@"
