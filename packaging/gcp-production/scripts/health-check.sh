#!/usr/bin/env bash
# Curl health endpoints on localhost (nginx port 80).
set -euo pipefail

BASE="${COLCOOR_HEALTH_BASE:-http://127.0.0.1}"
FAIL=0

check() {
  local path=$1
  echo "GET ${BASE}${path}"
  if ! curl -fsS "${BASE}${path}"; then
    echo "FAILED: ${BASE}${path}" >&2
    FAIL=1
  else
    echo ""
  fi
}

check "/health"
check "/ready"
check "/api/v1/health"

if [[ "$FAIL" -ne 0 ]]; then
  echo "Health check FAILED." >&2
  echo "Is the stack running? On an API VM after deploy: docker compose ps" >&2
  exit 1
fi

echo "All checks OK."
