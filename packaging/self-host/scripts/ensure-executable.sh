#!/usr/bin/env bash
# Restore +x on operator scripts after extraction tools that drop Unix modes (e.g. zip).
# Safe to run anytime. Does not need the script itself to be executable:
#   bash scripts/ensure-executable.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "$ROOT"/scripts/*.sh
if [[ -f "$ROOT/pgbouncer/docker-entrypoint.sh" ]]; then
  chmod +x "$ROOT/pgbouncer/docker-entrypoint.sh"
fi
echo "Restored executable permissions under $ROOT/scripts/ and pgbouncer/docker-entrypoint.sh"
