#!/usr/bin/env bash
# Source from repo root before `docker build`. Sets DOCKER_BUILDKIT=1 only when the
# Docker Buildx plugin is present; otherwise classic builder runs (no hard dependency on buildx).
#
#   source "$(dirname "$0")/docker-enable-buildkit-if-ok.sh"
# or from a known ROOT:
#   # shellcheck source=docker-enable-buildkit-if-ok.sh
#   source "$ROOT/scripts/docker-enable-buildkit-if-ok.sh"

if docker buildx version >/dev/null 2>&1; then
  export DOCKER_BUILDKIT=1
else
  # Some hosts enable BuildKit globally but omit buildx; that combination breaks `docker build`.
  export DOCKER_BUILDKIT=0
fi
