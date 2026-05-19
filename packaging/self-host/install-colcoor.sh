#!/usr/bin/env bash
# One-command Colcoor self-host install (run from the unpacked release bundle).
#
#   ./install-colcoor.sh
#
# Requires: Docker Engine, Docker Compose v2, curl, openssl.
# Opens HTTP on port 80 (standard). Override with SELF_HOST_HTTP_PORT in .env (e.g. 8080 for debug).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=== Colcoor self-host installer ==="

if [[ -x "$ROOT/scripts/ensure-executable.sh" ]]; then
  "$ROOT/scripts/ensure-executable.sh"
elif [[ -f "$ROOT/scripts/ensure-executable.sh" ]]; then
  bash "$ROOT/scripts/ensure-executable.sh"
else
  chmod +x "$ROOT"/scripts/*.sh 2>/dev/null || true
  [[ -f "$ROOT/pgbouncer/docker-entrypoint.sh" ]] && chmod +x "$ROOT/pgbouncer/docker-entrypoint.sh"
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

require_cmd docker
require_cmd curl
require_cmd openssl

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required (docker compose). See https://docs.docker.com/compose/install/" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running or not accessible. Add your user to the docker group or run with sudo." >&2
  exit 1
fi

"$ROOT/scripts/00-load-image.sh"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "Creating .env and secrets ..."
  "$ROOT/scripts/01-setup-env.sh"
else
  echo "Using existing .env"
fi

echo "Starting Colcoor stack (nginx on port $(grep -E '^SELF_HOST_HTTP_PORT=' "$ROOT/.env" 2>/dev/null | tail -1 | cut -d= -f2- || echo 80)) ..."
"$ROOT/scripts/02-stack-up.sh"

echo "Running health checks ..."
"$ROOT/scripts/05-health-check.sh"

# shellcheck source=scripts/lib/public-url.sh
source "$ROOT/scripts/lib/public-url.sh"
PORT="$(colcoor_read_http_port "$ROOT")"
LOCAL_BASE="$(colcoor_public_base_url "127.0.0.1" "$PORT")"
VM_IP="$(colcoor_detect_vm_ip || true)"

echo ""
echo "=============================================="
echo "  Colcoor is running"
echo "=============================================="
echo "  Health (local):  ${LOCAL_BASE}/health"
if [[ -n "$VM_IP" ]]; then
  VM_BASE="$(colcoor_public_base_url "$VM_IP" "$PORT")"
  echo "  Open in browser: ${VM_BASE}"
  echo ""
  echo "  Cursor → Colcoor: Backend base URL"
  echo "    ${VM_BASE}"
else
  echo ""
  echo "  Cursor → Colcoor: Backend base URL"
  echo "    http://<your-vm-public-ip>"
  if [[ "$PORT" != "80" ]]; then
    echo "    (with port :${PORT} if not using standard HTTP)"
  fi
fi
echo ""
echo "  Next steps:"
echo "    1. Allow inbound TCP ${PORT} (and 443 later) on your VM firewall / security group"
echo "    2. Install colcoor-extension-*.vsix in Cursor"
echo "    3. Sign in from the Colcoor sidebar"
echo ""
echo "  HTTPS and custom domain support are planned for a future release."
echo "  Advanced scripts: ./scripts/ (stack down, backup, debug port 8080 — see docs/self-host.md)"
echo "=============================================="
