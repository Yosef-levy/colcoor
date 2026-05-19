#!/usr/bin/env bash
# Self-host release bundle under dist/colcoor-enterprise-BE<x>-EXT<y>/
#
# Usage (repo root):
#   npm run bundle:self-host-release
#   bash scripts/build-self-host-bundle.sh [--skip-vsix] [--skip-docker] [--skip-tests]
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
SKIP_TESTS=0
for arg in "$@"; do
  case "$arg" in
    --skip-vsix) SKIP_VSIX=1 ;;
    --skip-docker) SKIP_DOCKER=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ "$SKIP_TESTS" -eq 0 ]]; then
  echo "Running extension typecheck ..."
  npm run typecheck -w colcoor-extension
  echo "Running extension tests ..."
  npm run test:extension
  echo "Running backend tests ..."
  npm run test:backend
fi

OUT="$ROOT/dist/${BUNDLE_BASENAME}"
rm -rf "$OUT"
mkdir -p "$OUT/docs" "$OUT/nginx" "$OUT/scripts" "$OUT/pgbouncer"

if [[ "$SKIP_DOCKER" -eq 0 ]]; then
  echo "Building backend image colcoor-backend:${BACKEND_VERSION} ..."
  docker build \
    -t "colcoor-backend:${BACKEND_VERSION}" \
    -t colcoor-backend:prod \
    -f packages/backend/Dockerfile \
    packages/backend

  echo "Building PgBouncer image ..."
  docker build -t colcoor-pgbouncer:1.23.1 -f pgbouncer/Dockerfile pgbouncer

  echo "Saving images ..."
  docker save "colcoor-backend:${BACKEND_VERSION}" colcoor-backend:prod | gzip >"$OUT/colcoor-backend-${BACKEND_VERSION}.tar.gz"
  docker save colcoor-pgbouncer:1.23.1 | gzip >"$OUT/colcoor-pgbouncer-1.23.1.tar.gz"
fi

if [[ "$SKIP_VSIX" -eq 0 ]]; then
  bash "$ROOT/scripts/ensure-npm-extension-deps.sh"
  echo "Packaging VSIX ..."
  npm run package -w colcoor-extension
  VSIX_BUILT="packages/extension/colcoor-extension-${EXT_VERSION}.vsix"
  if [[ ! -f "$VSIX_BUILT" ]]; then
    echo "Missing VSIX: $VSIX_BUILT" >&2
    exit 1
  fi
  cp -a "$VSIX_BUILT" "$OUT/"
  rm -f "$VSIX_BUILT"
fi

cp -a "$ROOT/packaging/self-host/docker-compose.yml" "$OUT/"
cp -a "$ROOT/packaging/self-host/README.customer.txt" "$OUT/"
cp -a "$ROOT/.env.example" "$OUT/.env.example"
cp -a "$ROOT/scripts/generate-self-host-secrets.sh" "$OUT/scripts/"
cp -a "$ROOT/packaging/self-host/scripts/"*.sh "$OUT/scripts/"
cp -a "$ROOT/nginx/nginx.conf" "$OUT/nginx/nginx.conf"
cp -a "$ROOT/pgbouncer/"* "$OUT/pgbouncer/"
# shellcheck source=lib/ensure-bundle-script-permissions.sh
source "$ROOT/scripts/lib/ensure-bundle-script-permissions.sh"
ensure_bundle_script_permissions "$OUT"

cp -a "$ROOT/docs/self-host.md" "$ROOT/docs/deployment-profiles.md" \
  "$ROOT/docs/release-quickstart.md" "$ROOT/docs/release-smoke-test.md" \
  "$ROOT/docs/release-versions.md" "$ROOT/docs/install-vsix.md" \
  "$OUT/docs/" 2>/dev/null || true
cp -a "$ROOT/RELEASE_NOTES.md" "$OUT/" 2>/dev/null || true

cat >"$OUT/VERSION.txt" <<EOF
backend=${BACKEND_VERSION}
extension=${EXT_VERSION}
bundle=${BUNDLE_BASENAME}
profile=self-host-free
EOF

bash "$ROOT/scripts/generate-release-checksums.sh" "$OUT"

ARCHIVE="$ROOT/dist/${BUNDLE_BASENAME}.tar.gz"
bash "$ROOT/scripts/archive-release-bundle.sh" "$OUT"
bash "$ROOT/scripts/validate-release-bundle.sh" "$OUT" "$ARCHIVE"

echo ""
echo "Self-host release bundle ready:"
echo "  $OUT"
echo "  $ARCHIVE  (recommended for Linux — preserves script permissions)"
echo "  ${ARCHIVE}.sha256"
echo ""
echo "Do not ship a plain zip of the folder; unzip often drops +x on scripts."
ls -la "$OUT"
ls -la "$ARCHIVE" "${ARCHIVE}.sha256" 2>/dev/null || true
