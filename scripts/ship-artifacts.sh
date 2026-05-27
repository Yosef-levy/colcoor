#!/usr/bin/env bash
# Build shippable artifacts: VSIX (extension) + backend Docker image(s).
# From repo root:
#   ./scripts/ship-artifacts.sh
# Optional: push to a registry (after `docker login`):
#   DOCKER_REGISTRY=ghcr.io/yourorg ./scripts/ship-artifacts.sh --push

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=docker-enable-buildkit-if-ok.sh
source "$ROOT/scripts/docker-enable-buildkit-if-ok.sh"

PUSH=0
if [[ "${1:-}" == "--push" ]]; then
  PUSH=1
fi

bash "$ROOT/scripts/ensure-npm-extension-deps.sh"
npm run package:extension

BACKEND_VERSION="$(
  grep -E '^version[[:space:]]*=' packages/backend/pyproject.toml | head -1 \
    | sed -E 's/^version[[:space:]]*=[[:space:]]*\"([^\"]+)\".*/\1/'
)"

if [[ -z "${BACKEND_VERSION}" ]]; then
  echo "Could not read version from packages/backend/pyproject.toml" >&2
  exit 1
fi

docker build \
  -t "colcoor-backend:${BACKEND_VERSION}" \
  -t "colcoor-backend:prod" \
  -f packages/backend/Dockerfile \
  packages/backend

EXT_VERSION="$(node -p "require('./packages/extension/package.json').version")"
# shellcheck source=lib/read-versions.sh
source "$ROOT/scripts/lib/read-versions.sh"
read_colcoor_versions

echo ""
echo "Built:"
echo "  VSIX:  dist/${BUNDLE_BASENAME}/colcoor-extension-${EXT_VERSION}.vsix"
echo "  Image: colcoor-backend:${BACKEND_VERSION}  (and :prod)"
echo ""
echo "For a GCP production customer bundle (image tarball + VSIX + compose + scripts):"
echo "  npm run bundle:gcp-production"

if [[ "${PUSH}" -eq 1 ]]; then
  if [[ -z "${DOCKER_REGISTRY:-}" ]]; then
    echo "Set DOCKER_REGISTRY (e.g. ghcr.io/acme) to push." >&2
    exit 1
  fi
  docker tag "colcoor-backend:${BACKEND_VERSION}" "${DOCKER_REGISTRY}/colcoor-backend:${BACKEND_VERSION}"
  docker tag "colcoor-backend:prod" "${DOCKER_REGISTRY}/colcoor-backend:prod"
  docker push "${DOCKER_REGISTRY}/colcoor-backend:${BACKEND_VERSION}"
  docker push "${DOCKER_REGISTRY}/colcoor-backend:prod"
  echo "Pushed: ${DOCKER_REGISTRY}/colcoor-backend:${BACKEND_VERSION} and :prod"
fi
