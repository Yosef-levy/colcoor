#!/usr/bin/env bash
# Customer-facing health via nginx (default host port 80). Backend stays internal on 8000.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=lib/public-url.sh
source "$ROOT/scripts/lib/public-url.sh"

PORT="$(colcoor_read_http_port "$ROOT")"
LOCAL_BASE="$(colcoor_public_base_url "127.0.0.1" "$PORT")"
VM_IP="$(colcoor_detect_vm_ip || true)"

check() {
  local base="$1"
  local label="$2"
  local path="$3"
  echo "GET ${base}${path} (${label})"
  curl -fsS "${base}${path}"
  echo ""
}

check "$LOCAL_BASE" "localhost" "/health"
check "$LOCAL_BASE" "localhost" "/ready"
check "$LOCAL_BASE" "localhost" "/api/v1/health"

if [[ -n "$VM_IP" ]]; then
  VM_BASE="$(colcoor_public_base_url "$VM_IP" "$PORT")"
  check "$VM_BASE" "vm-ip" "/health"
fi

if [[ "$PORT" != "80" ]]; then
  echo "Note: using SELF_HOST_HTTP_PORT=${PORT} (debug). Default install uses port 80."
fi

echo "All checks OK."
