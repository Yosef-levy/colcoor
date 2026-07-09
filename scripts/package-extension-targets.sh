#!/usr/bin/env bash
# Build platform-specific Colcoor VSIXs.
#
# The Claude Agent SDK (@anthropic-ai/claude-agent-sdk) is ESM-only and ships a per-platform native
# binary via optionalDependencies (~230 MB each). esbuild bundles everything else into
# dist/extension.js and marks the Agent SDK external, so each VSIX must carry only the SDK plus the
# one native binary that matches its target. We therefore package once per VS Code target triple.
#
# Usage (repo root):
#   npm run package:extension:targets                 # all default targets
#   bash scripts/package-extension-targets.sh linux-x64 darwin-arm64
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/ensure-npm-extension-deps.sh"

# shellcheck source=lib/read-versions.sh
source "$ROOT/scripts/lib/read-versions.sh"
read_colcoor_versions

EXT_DIR="$ROOT/packages/extension"
OUT="$ROOT/dist/colcoor-targets-EXT${EXT_VERSION}"
mkdir -p "$OUT"

DEFAULT_TARGETS=(linux-x64 linux-arm64 darwin-x64 darwin-arm64 win32-x64 win32-arm64)
if [[ "$#" -gt 0 ]]; then
  TARGETS=("$@")
else
  TARGETS=("${DEFAULT_TARGETS[@]}")
fi

# The Agent SDK's native binary package name for a VS Code target triple.
native_pkg_for_target() {
  case "$1" in
    linux-x64) echo "claude-agent-sdk-linux-x64" ;;
    linux-arm64) echo "claude-agent-sdk-linux-arm64" ;;
    darwin-x64) echo "claude-agent-sdk-darwin-x64" ;;
    darwin-arm64) echo "claude-agent-sdk-darwin-arm64" ;;
    win32-x64) echo "claude-agent-sdk-win32-x64" ;;
    win32-arm64) echo "claude-agent-sdk-win32-arm64" ;;
    *) echo "" ;;
  esac
}

# Copy a package from the (hoisted) root node_modules into the extension's node_modules so vsce
# includes it in the VSIX even with --no-dependencies (see .vscodeignore negations).
stage_module() {
  local name="$1"
  local src="$ROOT/node_modules/@anthropic-ai/$name"
  local dst="$EXT_DIR/node_modules/@anthropic-ai/$name"
  if [[ ! -d "$src" ]]; then
    return 1
  fi
  mkdir -p "$(dirname "$dst")"
  rm -rf "$dst"
  cp -R "$src" "$dst"
  return 0
}

echo "Building shared bundle (esbuild) ..."
npm run build -w colcoor-extension

for target in "${TARGETS[@]}"; do
  echo "=== Packaging $target ==="
  rm -rf "$EXT_DIR/node_modules/@anthropic-ai"
  stage_module "claude-agent-sdk" || {
    echo "Missing @anthropic-ai/claude-agent-sdk in root node_modules; run npm install." >&2
    exit 1
  }
  native="$(native_pkg_for_target "$target")"
  if [[ -n "$native" ]]; then
    if ! stage_module "$native"; then
      echo "WARNING: native package @anthropic-ai/$native not installed; $target VSIX will fall back to a user-installed Claude Code binary." >&2
    fi
    # Linux also ships a musl variant used on Alpine-based hosts.
    if [[ "$target" == linux-* ]]; then
      stage_module "${native}-musl" || true
    fi
  fi

  ( cd "$EXT_DIR" && npx --no-install vsce package --no-dependencies --target "$target" \
      -o "$OUT/colcoor-extension-${EXT_VERSION}-${target}.vsix" )
  echo "Done: $OUT/colcoor-extension-${EXT_VERSION}-${target}.vsix"
done

rm -rf "$EXT_DIR/node_modules/@anthropic-ai"
echo "All target VSIXs written to $OUT"
