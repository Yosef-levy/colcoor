#!/usr/bin/env bash
# Create a release tarball that preserves Unix file modes (unlike zip on many tools).
#
# Usage: ./scripts/archive-release-bundle.sh /path/to/colcoor-gcp-production-BE…-EXT…/
#
# Writes: dist/<bundle-basename>.tar.gz and dist/<bundle-basename>.tar.gz.sha256
set -euo pipefail

BUNDLE_DIR="${1:?bundle directory required}"
if [[ ! -d "$BUNDLE_DIR" ]]; then
  echo "Not a directory: $BUNDLE_DIR" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/ensure-bundle-script-permissions.sh
source "$ROOT/scripts/lib/ensure-bundle-script-permissions.sh"

ensure_bundle_script_permissions "$BUNDLE_DIR"

BUNDLE_NAME="$(basename "$BUNDLE_DIR")"
DIST_DIR="$(cd "$(dirname "$BUNDLE_DIR")" && pwd)"
ARCHIVE="$DIST_DIR/${BUNDLE_NAME}.tar.gz"

tar -czf "$ARCHIVE" -C "$DIST_DIR" "$BUNDLE_NAME"
(
  cd "$DIST_DIR"
  sha256sum "${BUNDLE_NAME}.tar.gz" >"${BUNDLE_NAME}.tar.gz.sha256"
)

echo "Wrote $ARCHIVE"
echo "Wrote ${ARCHIVE}.sha256"
