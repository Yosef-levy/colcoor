#!/usr/bin/env bash
# Stop the stack. Default: keeps the Postgres volume (data preserved).
# Usage:
#   ./scripts/03-stack-down.sh
#   ./scripts/03-stack-down.sh --remove-volumes   # destructive: drops named volume
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EXTRA=()
for arg in "$@"; do
  if [[ "$arg" == "--remove-volumes" ]]; then
    EXTRA+=(--volumes)
  fi
done

docker compose -f "$ROOT/docker-compose.yml" down "${EXTRA[@]}"
if ((${#EXTRA[@]} > 0)); then
  echo "Stack is down (Docker volumes removed)."
else
  echo "Stack is down (Postgres volume kept unless you used --remove-volumes)."
fi
