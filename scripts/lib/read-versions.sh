#!/usr/bin/env bash
# Source from release scripts: versions and bundle directory name.
# Usage: source "$(dirname "$0")/lib/read-versions.sh" && read_colcoor_versions

read_colcoor_versions() {
  BACKEND_VERSION="$(
    grep -E '^version[[:space:]]*=' packages/backend/pyproject.toml | head -1 \
      | sed -E 's/^version[[:space:]]*=[[:space:]]*\"([^\"]+)\".*/\1/'
  )"
  EXT_VERSION="$(node -p "require('./packages/extension/package.json').version")"
  if [[ -z "${BACKEND_VERSION}" || -z "${EXT_VERSION}" ]]; then
    echo "Could not read backend or extension version." >&2
    return 1
  fi
  BUNDLE_BASENAME="colcoor-gcp-production-BE${BACKEND_VERSION}-EXT${EXT_VERSION}"
  export BACKEND_VERSION EXT_VERSION BUNDLE_BASENAME
}
