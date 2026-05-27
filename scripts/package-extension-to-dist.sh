#!/usr/bin/env bash
# Build the extension VSIX and place it under dist/colcoor-gcp-production-BE…-EXT…/
# (same layout as npm run bundle:gcp-production). Removes the transient file from packages/extension.
#
# Usage (repo root): npm run package:extension
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/ensure-npm-extension-deps.sh"

# shellcheck source=lib/read-versions.sh
source "$ROOT/scripts/lib/read-versions.sh"
read_colcoor_versions

OUT="$ROOT/dist/${BUNDLE_BASENAME}"
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
