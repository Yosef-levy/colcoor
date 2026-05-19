#!/usr/bin/env bash
# Verify a release bundle (and optional distribution tarball) before shipping.
#
# Usage:
#   ./scripts/validate-release-bundle.sh [bundle-dir] [archive.tar.gz]
#
# Defaults bundle-dir to dist/colcoor-enterprise-BE…-EXT…/ from read-versions.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/read-versions.sh
source "$ROOT/scripts/lib/read-versions.sh"
read_colcoor_versions

BUNDLE_DIR="${1:-$ROOT/dist/${BUNDLE_BASENAME}}"
ARCHIVE="${2:-$ROOT/dist/${BUNDLE_BASENAME}.tar.gz}"

FAIL=0

assert_scripts_executable() {
  local dir="$1"
  local label="$2"
  local bad=0

  if [[ ! -d "$dir/scripts" ]]; then
    echo "ERROR [$label] missing scripts/: $dir" >&2
    return 1
  fi

  shopt -s nullglob
  local f
  for f in "$dir"/scripts/*.sh; do
    if [[ ! -x "$f" ]]; then
      echo "ERROR [$label] not executable: $f" >&2
      bad=1
    fi
  done
  shopt -u nullglob

  if [[ -f "$dir/pgbouncer/docker-entrypoint.sh" && ! -x "$dir/pgbouncer/docker-entrypoint.sh" ]]; then
    echo "ERROR [$label] not executable: $dir/pgbouncer/docker-entrypoint.sh" >&2
    bad=1
  fi

  if [[ -f "$dir/install-colcoor.sh" && ! -x "$dir/install-colcoor.sh" ]]; then
    echo "ERROR [$label] not executable: $dir/install-colcoor.sh" >&2
    bad=1
  fi

  return "$bad"
}

if [[ ! -d "$BUNDLE_DIR" ]]; then
  echo "Bundle directory missing: $BUNDLE_DIR" >&2
  exit 1
fi

echo "Validating bundle directory: $BUNDLE_DIR"
assert_scripts_executable "$BUNDLE_DIR" "bundle" || FAIL=1

if [[ -f "$BUNDLE_DIR/SHA256SUMS" ]]; then
  echo "Checking SHA256SUMS in bundle ..."
  if ! (cd "$BUNDLE_DIR" && sha256sum -c SHA256SUMS >/dev/null); then
    echo "ERROR: SHA256SUMS verification failed in $BUNDLE_DIR" >&2
    FAIL=1
  fi
else
  echo "WARN: no SHA256SUMS in bundle (skipped)" >&2
fi

if [[ -f "$ARCHIVE" ]]; then
  echo "Validating distribution archive: $ARCHIVE"
  if [[ -f "${ARCHIVE}.sha256" ]]; then
  if ! (cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "${ARCHIVE}.sha256")" >/dev/null); then
      echo "ERROR: archive checksum failed: ${ARCHIVE}.sha256" >&2
      FAIL=1
    fi
  fi
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  tar -xzf "$ARCHIVE" -C "$TMP"
  EXTRACTED="$TMP/$(basename "$BUNDLE_DIR")"
  if [[ ! -d "$EXTRACTED" ]]; then
    echo "ERROR: archive did not contain $(basename "$BUNDLE_DIR")/" >&2
    FAIL=1
  else
    assert_scripts_executable "$EXTRACTED" "extracted-tarball" || FAIL=1
  fi
  trap - EXIT
  rm -rf "$TMP"
else
  echo "WARN: distribution archive not found (skipped extract test): $ARCHIVE" >&2
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "Release validation FAILED." >&2
  exit 1
fi

echo "Release validation OK."
