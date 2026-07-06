#!/usr/bin/env bash
# Build the extension VSIX and place it under dist/colcoor-standalone-EXT…/.
#
# The shipped VSIX is identical to the regular build: offline (local) mode is a runtime
# setting (colcoor.storageMode = "local"), not a separate binary. This script simply
# emits the packaged artifact into a dedicated dist folder for the standalone/offline
# distribution, alongside a short README describing how to enable offline mode.
#
# Usage (repo root): npm run package:extension:standalone
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/ensure-npm-extension-deps.sh"

# shellcheck source=lib/read-versions.sh
source "$ROOT/scripts/lib/read-versions.sh"
read_colcoor_versions

OUT="$ROOT/dist/colcoor-standalone-EXT${EXT_VERSION}"
mkdir -p "$OUT"

echo "Packaging standalone VSIX into $OUT ..."
npm run package -w colcoor-extension

SRC="$ROOT/packages/extension/colcoor-extension-${EXT_VERSION}.vsix"
if [[ ! -f "$SRC" ]]; then
  echo "Expected VSIX not found: $SRC" >&2
  exit 1
fi

mv "$SRC" "$OUT/colcoor-extension-${EXT_VERSION}.vsix"

cat >"$OUT/README.md" <<EOF
# Colcoor standalone (offline) extension — EXT ${EXT_VERSION}

This is the standard Colcoor extension VSIX. To run it fully offline (single-user,
no backend, no collaboration):

1. Install \`colcoor-extension-${EXT_VERSION}.vsix\` in Cursor / VS Code
   (Extensions view -> ... -> Install from VSIX).
2. Open the workspace folder you want to keep conversations in.
3. Set \`colcoor.storageMode\` to \`local\` in Settings (or add
   \`"colcoor.storageMode": "local"\` to the workspace \`.vscode/settings.json\`).
4. Reload the window (Developer: Reload Window).

In offline mode all conversation data is stored under \`<workspace>/.colcoor/\`.
Switching workspaces shows only the conversations created there. Add \`.colcoor/\`
to your \`.gitignore\` if you do not want to commit local conversations.
EOF

echo "Done: $OUT/colcoor-extension-${EXT_VERSION}.vsix"
echo "Done: $OUT/README.md"
