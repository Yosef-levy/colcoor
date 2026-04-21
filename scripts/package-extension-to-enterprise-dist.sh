#!/usr/bin/env bash
# Build the extension VSIX and place it only under dist/colcoor-enterprise-BE…-EXT…/
# (same layout as npm run bundle:enterprise). Removes the transient file from packages/extension.
#
# Usage (repo root): npm run package:extension
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/ensure-npm-extension-deps.sh"

BACKEND_VERSION="$(
  grep -E '^version[[:space:]]*=' packages/backend/pyproject.toml | head -1 \
    | sed -E 's/^version[[:space:]]*=[[:space:]]*\"([^\"]+)\".*/\1/'
)"
EXT_VERSION="$(node -p "require('./packages/extension/package.json').version")"

if [[ -z "${BACKEND_VERSION}" || -z "${EXT_VERSION}" ]]; then
  echo "Could not read backend or extension version." >&2
  exit 1
fi

BUNDLE_NAME="colcoor-enterprise-BE${BACKEND_VERSION}-EXT${EXT_VERSION}"
OUT="$ROOT/dist/${BUNDLE_NAME}"
mkdir -p "$OUT"

echo "Packaging VSIX into $OUT ..."
npm run package -w colcoor-extension

SRC="$ROOT/packages/extension/colcoor-extension-${EXT_VERSION}.vsix"
if [[ ! -f "$SRC" ]]; then
  echo "Expected VSIX not found: $SRC" >&2
  exit 1
fi

mv "$SRC" "$OUT/colcoor-extension-${EXT_VERSION}.vsix"
echo "Done: $OUT/colcoor-extension-${EXT_VERSION}.vsix"
