#!/usr/bin/env bash
# Ensure workspace node_modules exist so `tsc` / `vsce` are available for extension packaging.
# Run from repo root: bash scripts/ensure-npm-extension-deps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

require_node_20() {
  local major
  major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
  if [[ "$major" -lt 20 ]]; then
    echo "Node.js 20+ is required (found $(node --version 2>/dev/null || echo 'unknown'))." >&2
    echo "Use nvm/fnm with .nvmrc, or install Node 20 from https://nodejs.org/." >&2
    exit 1
  fi
}

require_node_20

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
