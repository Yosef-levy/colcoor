#!/usr/bin/env bash
# Load Colcoor Docker images from tarballs in the bundle root (backend + PgBouncer).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

load_one() {
  local pattern="$1"
  local label="$2"
  local tar=""
  shopt -s nullglob
  local matches=($pattern)
  shopt -u nullglob
  if ((${#matches[@]} == 0)); then
    echo "No ${pattern} in $ROOT." >&2
    return 1
  fi
  if ((${#matches[@]} > 1)); then
    echo "Multiple ${pattern} files; keep only one:" >&2
    printf '  %s\n' "${matches[@]}" >&2
    return 1
  fi
  tar="${matches[0]}"
  echo "Loading ${label} from ${tar} ..."
  docker load -i "$tar"
}

if [[ -n "${IMAGE_TAR:-}" ]]; then
  echo "Loading Docker image from $IMAGE_TAR ..."
  docker load -i "$IMAGE_TAR"
else
  load_one "colcoor-backend-*.tar.gz" "backend"
  load_one "colcoor-pgbouncer-*.tar.gz" "PgBouncer"
fi

echo "Done. Expected tags: colcoor-backend:prod, colcoor-pgbouncer:1.23.1"
echo "Run: docker images colcoor-backend colcoor-pgbouncer"
