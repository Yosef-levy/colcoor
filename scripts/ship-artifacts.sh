#!/usr/bin/env bash
# Build shippable artifacts: VSIX (extension) + backend Docker image(s).
# From repo root:
#   ./scripts/ship-artifacts.sh
# Optional: push to a registry (after `docker login`):
#   DOCKER_REGISTRY=ghcr.io/yourorg ./scripts/ship-artifacts.sh --push

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PUSH=0
if [[ "${1:-}" == "--push" ]]; then
  PUSH=1
fi

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

echo ""
echo "Built:"
echo "  VSIX:  packages/extension/colcoor-extension-$(node -p "require('./packages/extension/package.json').version").vsix"
echo "  Image: colcoor-backend:${BACKEND_VERSION}  (and :prod)"

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
