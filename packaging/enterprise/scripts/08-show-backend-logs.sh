#!/usr/bin/env bash
# Show backend container logs (use when healthcheck fails or stack won't start).
# Optional args are passed to `docker compose logs` (e.g. --tail=200 -f).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

docker compose -f "$ROOT/docker-compose.yml" logs --no-color "$@" backend
