#!/usr/bin/env bash
# Best-effort restart: down (no volume removal) then up.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

"$ROOT/scripts/03-stack-down.sh"
"$ROOT/scripts/02-stack-up.sh"
