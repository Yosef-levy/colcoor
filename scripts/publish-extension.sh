#!/usr/bin/env bash
# Publish the platform-specific Colcoor VSIXs to the VS Marketplace and Open VSX.
#
# Publishing to both registries covers real VS Code (VS Marketplace) and the VS Code forks that pull
# from Open VSX (VSCodium, Cursor, Windsurf). Both registries are free.
#
# Prerequisites:
#   - Run scripts/package-extension-targets.sh first to produce the per-target VSIXs.
#   - VSCE_PAT set for the VS Marketplace (`vsce login` also works).
#   - OVSX_PAT set for Open VSX.
#
# Usage (repo root):
#   npm run publish:extension                          # publish every VSIX in the target dir
#   bash scripts/publish-extension.sh path/to/dir      # publish VSIXs from a specific directory
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=lib/read-versions.sh
source "$ROOT/scripts/lib/read-versions.sh"
read_colcoor_versions

DIR="${1:-$ROOT/dist/colcoor-targets-EXT${EXT_VERSION}}"
if [[ ! -d "$DIR" ]]; then
  echo "No VSIX directory found at $DIR. Run scripts/package-extension-targets.sh first." >&2
  exit 1
fi

shopt -s nullglob
vsixes=("$DIR"/*.vsix)
if [[ "${#vsixes[@]}" -eq 0 ]]; then
  echo "No .vsix files in $DIR." >&2
  exit 1
fi

for vsix in "${vsixes[@]}"; do
  echo "=== Publishing $(basename "$vsix") ==="
  echo "-> VS Marketplace"
  npx --no-install vsce publish --packagePath "$vsix" ${VSCE_PAT:+--pat "$VSCE_PAT"}
  echo "-> Open VSX"
  npx --no-install ovsx publish "$vsix" ${OVSX_PAT:+--pat "$OVSX_PAT"}
done

echo "Published ${#vsixes[@]} VSIX(es) from $DIR"
