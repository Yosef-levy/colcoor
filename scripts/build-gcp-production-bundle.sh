#!/usr/bin/env bash
# Assemble the GCP production customer bundle under dist/:
#   colcoor-gcp-production-BE<backend>-EXT<ext>/
#
# Usage (from repo root):
#   npm run bundle:gcp-production
#   bash scripts/build-gcp-production-bundle.sh [--skip-vsix] [--vsix-path=FILE] [--skip-docker]
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=docker-enable-buildkit-if-ok.sh
source "$ROOT/scripts/docker-enable-buildkit-if-ok.sh"
# shellcheck source=lib/read-versions.sh
source "$ROOT/scripts/lib/read-versions.sh"
read_colcoor_versions

SKIP_VSIX=0
SKIP_DOCKER=0
VSIX_PATH=""
for arg in "$@"; do
  case "$arg" in
    --skip-vsix) SKIP_VSIX=1 ;;
    --skip-docker) SKIP_DOCKER=1 ;;
    --vsix-path=*) VSIX_PATH="${arg#*=}" ;;
    *)
      echo "Unknown option: $arg (use --skip-vsix, --skip-docker, or --vsix-path=FILE)" >&2
      exit 1
      ;;
  esac
done
if [[ "${COLCOOR_BUNDLE_SKIP_VSIX:-}" == "1" ]]; then
  SKIP_VSIX=1
fi
if [[ "$SKIP_VSIX" -eq 1 && -n "$VSIX_PATH" ]]; then
  echo "Use either --skip-vsix or --vsix-path=..., not both." >&2
  exit 1
fi

OUT="$ROOT/dist/${BUNDLE_BASENAME}"

if [[ "$SKIP_DOCKER" != "1" ]]; then
  echo "Building backend image colcoor-backend:${BACKEND_VERSION} ..."
  docker build \
    -t "colcoor-backend:${BACKEND_VERSION}" \
    -t "colcoor-backend:prod" \
    -f packages/backend/Dockerfile \
    packages/backend

  echo "Building PgBouncer image colcoor-pgbouncer:1.23.1 ..."
  docker build \
    -t "colcoor-pgbouncer:1.23.1" \
    -f pgbouncer/Dockerfile \
    pgbouncer
fi

VSIX_OUT=""
if [[ -n "$VSIX_PATH" ]]; then
  [[ -f "$VSIX_PATH" ]] || { echo "VSIX not found: $VSIX_PATH" >&2; exit 1; }
  echo "Using existing VSIX: $VSIX_PATH"
  VSIX_OUT="$VSIX_PATH"
elif [[ "$SKIP_VSIX" -eq 1 ]]; then
  echo "Skipping VSIX packaging (--skip-vsix)."
else
  bash "$ROOT/scripts/ensure-npm-extension-deps.sh"
  echo "Packaging VSIX ..."
  npm run package -w colcoor-extension
  VSIX_BUILT="packages/extension/colcoor-extension-${EXT_VERSION}.vsix"
  [[ -f "$VSIX_BUILT" ]] || {
    echo "Expected VSIX missing: $VSIX_BUILT" >&2
    exit 1
  }
  VSIX_OUT="$VSIX_BUILT"
fi

rm -rf "$OUT"
mkdir -p "$OUT/nginx" "$OUT/scripts/gcp/lib" "$OUT/pgbouncer"

if [[ "$SKIP_DOCKER" != "1" ]]; then
  echo "Saving backend image ..."
  docker save "colcoor-backend:${BACKEND_VERSION}" colcoor-backend:prod | gzip >"$OUT/colcoor-backend-${BACKEND_VERSION}.tar.gz"
  echo "Saving PgBouncer image ..."
  docker save colcoor-pgbouncer:1.23.1 | gzip >"$OUT/colcoor-pgbouncer-1.23.1.tar.gz"
fi

if [[ -n "$VSIX_OUT" ]]; then
  cp -a "$VSIX_OUT" "$OUT/"
  if [[ "$VSIX_OUT" == "packages/extension/colcoor-extension-${EXT_VERSION}.vsix" ]]; then
    rm -f "$VSIX_OUT"
  fi
fi
if [[ "$SKIP_VSIX" -eq 1 ]]; then
  cat >"$OUT/EXTENSION_VSIX_NOT_INCLUDED.txt" <<'EOF'
This bundle was built with --skip-vsix.

Add colcoor-extension-*.vsix from a dev machine:
  npm install && npm run package -w colcoor-extension

Or rebuild with:
  npm run bundle:gcp-production -- --vsix-path=/path/to/colcoor-extension-0.0.1.vsix
EOF
fi

cp -a "$ROOT/packaging/gcp-production/docker-compose.yml" "$OUT/"
cp -a "$ROOT/packaging/gcp-production/gcp.env.example" "$OUT/"
cp -a "$ROOT/packaging/gcp-production/README.md" "$OUT/README.md"
if [[ -d "$ROOT/packaging/gcp-production/docs" ]]; then
  cp -a "$ROOT/packaging/gcp-production/docs" "$OUT/"
fi
cp -a "$ROOT/nginx/nginx.conf" "$OUT/nginx/nginx.conf"
cp -a "$ROOT/pgbouncer/"* "$OUT/pgbouncer/"
cp -a "$ROOT/packaging/gcp-production/scripts/"*.sh "$OUT/scripts/"
cp -a "$ROOT/scripts/deploy-multi-vm.sh" "$OUT/scripts/"
cp -a "$ROOT/scripts/gcp/"*.sh "$OUT/scripts/gcp/"
cp -a "$ROOT/scripts/gcp/lib/" "$OUT/scripts/gcp/"

# shellcheck source=lib/ensure-bundle-script-permissions.sh
source "$ROOT/scripts/lib/ensure-bundle-script-permissions.sh"
ensure_bundle_script_permissions "$OUT"

cat >"$OUT/VERSION.txt" <<EOF
backend=${BACKEND_VERSION}
extension=${EXT_VERSION}
bundle=${BUNDLE_BASENAME}
profile=gcp-production
EOF

if [[ -f "$ROOT/RELEASE_NOTES.md" ]]; then
  cp -a "$ROOT/RELEASE_NOTES.md" "$OUT/"
fi

bash "$ROOT/scripts/generate-release-checksums.sh" "$OUT"

ARCHIVE="$ROOT/dist/${BUNDLE_BASENAME}.tar.gz"
bash "$ROOT/scripts/archive-release-bundle.sh" "$OUT"
bash "$ROOT/scripts/validate-release-bundle.sh" "$OUT" "$ARCHIVE"

echo ""
echo "GCP production bundle ready:"
echo "  $OUT"
echo "  $ARCHIVE"
echo "  ${ARCHIVE}.sha256"
ls -la "$OUT"
ls -la "$ARCHIVE" "${ARCHIVE}.sha256" 2>/dev/null || true
