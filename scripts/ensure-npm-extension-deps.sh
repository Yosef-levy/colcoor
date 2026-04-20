#!/usr/bin/env bash
# Ensure workspace node_modules exist so `tsc` / `vsce` are available for extension packaging.
# Run from repo root: bash scripts/ensure-npm-extension-deps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

have_tsc() {
  [[ -x "$ROOT/node_modules/.bin/tsc" ]] || [[ -x "$ROOT/packages/extension/node_modules/.bin/tsc" ]]
}

if have_tsc; then
  exit 0
fi

echo "TypeScript (tsc) not found under node_modules. Installing npm dependencies at repo root..."
if [[ -f "$ROOT/package-lock.json" ]]; then
  npm ci
else
  npm install
fi
