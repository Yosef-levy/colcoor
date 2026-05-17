#!/usr/bin/env bash
# Assemble a distributable enterprise folder under dist/:
#   - colcoor-backend-<version>.tar.gz  (docker save, both :prod and :<version> tags)
#   - colcoor-extension-<version>.vsix
#   - docker-compose.yml, nginx/, pgbouncer/, scripts/, README.customer.txt
#
# Usage (from repo root):
#   npm run bundle:enterprise
#   # Backend + compose only (no Node/tsc on this machine — add a .vsix from your dev box):
#   npm run bundle:enterprise -- --skip-vsix
#   # Or copy an existing VSIX into the bundle:
#   npm run bundle:enterprise -- --vsix-path=/path/to/colcoor-extension-0.0.1.vsix
#   # or
#   bash scripts/build-enterprise-bundle.sh [--skip-vsix] [--vsix-path=FILE]
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=docker-enable-buildkit-if-ok.sh
source "$ROOT/scripts/docker-enable-buildkit-if-ok.sh"

SKIP_VSIX=0
VSIX_PATH=""
for arg in "$@"; do
  case "$arg" in
    --skip-vsix) SKIP_VSIX=1 ;;
    --vsix-path=*) VSIX_PATH="${arg#*=}" ;;
    *)
      echo "Unknown option: $arg (use --skip-vsix or --vsix-path=FILE)" >&2
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

BACKEND_VERSION="$(
  grep -E '^version[[:space:]]*=' packages/backend/pyproject.toml | head -1 \
    | sed -E 's/^version[[:space:]]*=[[:space:]]*\"([^\"]+)\".*/\1/'
)"
EXT_VERSION="$(node -p "require('./packages/extension/package.json').version")"

if [[ -z "${BACKEND_VERSION}" || -z "${EXT_VERSION}" ]]; then
  echo "Could not read versions." >&2
  exit 1
fi

BUNDLE_NAME="colcoor-enterprise-BE${BACKEND_VERSION}-EXT${EXT_VERSION}"
OUT="$ROOT/dist/${BUNDLE_NAME}"

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

VSIX_OUT=""
if [[ -n "$VSIX_PATH" ]]; then
  if [[ ! -f "$VSIX_PATH" ]]; then
    echo "VSIX not found: $VSIX_PATH" >&2
    exit 1
  fi
  echo "Using existing VSIX: $VSIX_PATH"
  VSIX_OUT="$VSIX_PATH"
elif [[ "$SKIP_VSIX" -eq 1 ]]; then
  echo "Skipping VSIX packaging (--skip-vsix). Add colcoor-extension-*.vsix from a machine where npm install && npm run package -w colcoor-extension succeeded."
else
  bash "$ROOT/scripts/ensure-npm-extension-deps.sh"
  echo "Packaging VSIX ..."
  npm run package -w colcoor-extension
  VSIX_BUILT="packages/extension/colcoor-extension-${EXT_VERSION}.vsix"
  if [[ ! -f "$VSIX_BUILT" ]]; then
    echo "Expected VSIX missing: $VSIX_BUILT (try: npm install from repo root, or use --skip-vsix / --vsix-path=...)" >&2
    exit 1
  fi
  VSIX_OUT="$VSIX_BUILT"
fi

rm -rf "$OUT"
mkdir -p "$OUT/nginx" "$OUT/scripts" "$OUT/pgbouncer"

echo "Saving backend image to tarball (both tags) ..."
docker save "colcoor-backend:${BACKEND_VERSION}" colcoor-backend:prod | gzip >"$OUT/colcoor-backend-${BACKEND_VERSION}.tar.gz"

echo "Saving PgBouncer image to tarball ..."
docker save colcoor-pgbouncer:1.23.1 | gzip >"$OUT/colcoor-pgbouncer-1.23.1.tar.gz"

if [[ -n "$VSIX_OUT" ]]; then
  cp -a "$VSIX_OUT" "$OUT/"
  # Keep release artifacts under dist/ only.
  if [[ "$VSIX_OUT" == "packages/extension/colcoor-extension-${EXT_VERSION}.vsix" ]]; then
    rm -f "$VSIX_OUT"
  fi
fi
if [[ "$SKIP_VSIX" -eq 1 ]]; then
  cat >"$OUT/EXTENSION_VSIX_NOT_INCLUDED.txt" <<'EOF'
This bundle was built with --skip-vsix (typical on a Docker-only VM).

Add the extension installer from your dev machine:
  dist/colcoor-enterprise-BE<backend>-EXT<ext>/colcoor-extension-<version>.vsix
after:  cd repo && npm install && npm run package:extension

Or rebuild the bundle with:
  npm run bundle:enterprise -- --vsix-path=/path/to/colcoor-extension-0.0.1.vsix
EOF
fi
cp -a "$ROOT/packaging/enterprise/docker-compose.yml" "$OUT/"
cp -a "$ROOT/packaging/enterprise/README.customer.txt" "$OUT/"
cp -a "$ROOT/nginx/nginx.conf" "$OUT/nginx/nginx.conf"
cp -a "$ROOT/pgbouncer/"* "$OUT/pgbouncer/"
cp -a "$ROOT/packaging/enterprise/scripts/"*.sh "$OUT/scripts/"
mkdir -p "$OUT/scripts/lib"
cp -a "$ROOT/scripts/backup-postgres.sh" "$ROOT/scripts/restore-postgres.sh" \
  "$ROOT/scripts/verify-backup-postgres.sh" "$OUT/scripts/"
cp -a "$ROOT/scripts/lib/postgres-backup-lib.sh" "$OUT/scripts/lib/"
chmod +x "$OUT/scripts/"*.sh "$OUT/pgbouncer/docker-entrypoint.sh"

echo ""
echo "Enterprise bundle ready:"
echo "  $OUT"
echo ""
echo "Give the company the folder (or zip it):"
echo "  (cd dist && zip -r \"${BUNDLE_NAME}.zip\" \"${BUNDLE_NAME}\")"
ls -la "$OUT"
