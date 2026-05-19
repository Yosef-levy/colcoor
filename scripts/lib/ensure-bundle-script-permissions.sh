#!/usr/bin/env bash
# Restore executable bits on operator scripts in a release bundle directory.
# shellcheck shell=bash

ensure_bundle_script_permissions() {
  local bundle_dir="${1:?bundle directory required}"
  if [[ ! -d "$bundle_dir" ]]; then
    echo "Not a directory: $bundle_dir" >&2
    return 1
  fi
  shopt -s nullglob
  local f
  for f in "$bundle_dir"/scripts/*.sh; do
    chmod +x "$f"
  done
  shopt -u nullglob
  if [[ -f "$bundle_dir/pgbouncer/docker-entrypoint.sh" ]]; then
    chmod +x "$bundle_dir/pgbouncer/docker-entrypoint.sh"
  fi
}
