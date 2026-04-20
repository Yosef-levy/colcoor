#!/usr/bin/env bash
# Load the Colcoor backend image from the tarball in the bundle root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -n "${IMAGE_TAR:-}" ]]; then
  TAR="$IMAGE_TAR"
else
  shopt -s nullglob
  matches=(colcoor-backend-*.tar.gz)
  shopt -u nullglob
  if ((${#matches[@]} == 0)); then
    echo "No colcoor-backend-*.tar.gz in $ROOT. Set IMAGE_TAR=/path/to/file.tar.gz" >&2
    exit 1
  fi
  if ((${#matches[@]} > 1)); then
    echo "Multiple colcoor-backend-*.tar.gz files; set IMAGE_TAR to one of them:" >&2
    printf '  %s\n' "${matches[@]}" >&2
    exit 1
  fi
  TAR="${matches[0]}"
fi

if [[ ! -f "$TAR" ]]; then
  echo "Not a file: $TAR" >&2
  exit 1
fi

echo "Loading Docker image from $TAR ..."
docker load -i "$TAR"
echo "Done. Expected tag: colcoor-backend:prod (and version tag). Run: docker images colcoor-backend"
