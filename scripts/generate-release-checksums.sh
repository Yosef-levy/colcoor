#!/usr/bin/env bash
# Write SHA256SUMS and MANIFEST.txt for a release bundle directory.
# Usage: ./scripts/generate-release-checksums.sh /path/to/bundle-dir
set -euo pipefail

BUNDLE_DIR="${1:?bundle directory required}"
if [[ ! -d "$BUNDLE_DIR" ]]; then
  echo "Not a directory: $BUNDLE_DIR" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/read-versions.sh
source "$ROOT/scripts/lib/read-versions.sh"
read_colcoor_versions

SUMS="$BUNDLE_DIR/SHA256SUMS"
MANIFEST="$BUNDLE_DIR/MANIFEST.txt"

(
  cd "$BUNDLE_DIR"
  find . -type f ! -name SHA256SUMS ! -name MANIFEST.txt | sort | while read -r f; do
    rel="${f#./}"
    sha256sum "$rel"
  done
) >"$SUMS"

BACKEND_DIGEST=""
if docker image inspect "colcoor-backend:${BACKEND_VERSION}" >/dev/null 2>&1; then
  BACKEND_DIGEST="$(docker image inspect "colcoor-backend:${BACKEND_VERSION}" --format '{{.Id}}' 2>/dev/null || true)"
fi

cat >"$MANIFEST" <<EOF
Colcoor release bundle
======================
Bundle directory: $(basename "$BUNDLE_DIR")
Backend version:  ${BACKEND_VERSION}  (pyproject.toml)
Extension version: ${EXT_VERSION}  (packages/extension/package.json)
Compatible pair:  backend ${BACKEND_VERSION} + extension ${EXT_VERSION}
Generated (UTC):  $(date -u +"%Y-%m-%dT%H:%M:%SZ")

Docker image tags (after load):
  colcoor-backend:${BACKEND_VERSION}
  colcoor-backend:prod
  colcoor-pgbouncer:1.23.1
Backend image ID: ${BACKEND_DIGEST:-not built on this machine}

Verify bundle file checksums:
  cd $(basename "$BUNDLE_DIR") && sha256sum -c SHA256SUMS

Distribution (recommended for Linux):
  Ship $(basename "$BUNDLE_DIR").tar.gz from the parent dist/ folder (not a zip).
  Extract: tar -xzf $(basename "$BUNDLE_DIR").tar.gz
  Verify archive: sha256sum -c $(basename "$BUNDLE_DIR").tar.gz.sha256
EOF

echo "Wrote $SUMS and $MANIFEST"
