#!/usr/bin/env bash
# Assemble a distributable enterprise folder under dist/:
#   - colcoor-backend-<version>.tar.gz  (docker save, both :prod and :<version> tags)
#   - colcoor-extension-<version>.vsix
#   - docker-compose.yml, nginx/, scripts/, README.customer.txt
#
# Usage (from repo root):
#   npm run bundle:enterprise
#   # or
#   bash scripts/build-enterprise-bundle.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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

echo "Packaging VSIX ..."
npm run package:extension

VSIX=(packages/extension/colcoor-extension-"${EXT_VERSION}".vsix)
if [[ ! -f "${VSIX[0]}" ]]; then
  echo "Expected VSIX missing: ${VSIX[0]}" >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT/nginx" "$OUT/scripts"

echo "Saving image to tarball (both tags) ..."
docker save "colcoor-backend:${BACKEND_VERSION}" colcoor-backend:prod | gzip >"$OUT/colcoor-backend-${BACKEND_VERSION}.tar.gz"

cp -a "${VSIX[0]}" "$OUT/"
cp -a "$ROOT/packaging/enterprise/docker-compose.yml" "$OUT/"
cp -a "$ROOT/packaging/enterprise/README.customer.txt" "$OUT/"
cp -a "$ROOT/nginx/nginx.conf" "$OUT/nginx/nginx.conf"
cp -a "$ROOT/packaging/enterprise/scripts/"*.sh "$OUT/scripts/"
chmod +x "$OUT/scripts/"*.sh

echo ""
echo "Enterprise bundle ready:"
echo "  $OUT"
echo ""
echo "Give the company the folder (or zip it):"
echo "  (cd dist && zip -r \"${BUNDLE_NAME}.zip\" \"${BUNDLE_NAME}\")"
ls -la "$OUT"
