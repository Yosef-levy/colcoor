#!/usr/bin/env bash
# Load Colcoor Docker images from tarballs in the bundle root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

load_one() {
  local pattern="$1"
  local label="$2"
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
  echo "Loading ${label} from ${matches[0]} ..."
  docker load -i "${matches[0]}"
}

load_one "colcoor-backend-*.tar.gz" "backend"
load_one "colcoor-pgbouncer-*.tar.gz" "PgBouncer"

echo "Done. Expected tags: colcoor-backend:prod, colcoor-pgbouncer:1.23.1"
echo "Run: docker images | grep colcoor"
