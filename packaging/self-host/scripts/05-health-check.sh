#!/usr/bin/env bash
# Curl health endpoints (self-host nginx port, default 8080).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=8080
if [[ -f "$ROOT/.env" ]]; then
  line="$(grep -E '^SELF_HOST_HTTP_PORT=' "$ROOT/.env" | tail -1 || true)"
  if [[ -n "$line" ]]; then
    PORT="${line#SELF_HOST_HTTP_PORT=}"
  fi
fi
BASE="${COLCOOR_HEALTH_BASE:-http://127.0.0.1:${PORT}}"

check() {
  local path="$1"
  echo "GET $BASE$path"
  curl -fsS "$BASE$path"
  echo ""
}

check /health
check /ready
check /api/v1/health

echo "All checks OK."
