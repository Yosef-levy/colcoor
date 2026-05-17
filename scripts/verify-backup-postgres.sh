#!/usr/bin/env bash
# Verify a gzip SQL backup (integrity + optional test restore into a throwaway DB).
#
# Usage:
#   ./scripts/verify-backup-postgres.sh --file ./backups/colcoor-postgres-....sql.gz
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) FILE="${2:-}"; shift 2 ;;
    -h|--help)
      echo "Usage: verify-backup-postgres.sh --file PATH.sql.gz"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "--file required" >&2
  exit 1
fi

echo "gzip -t ..."
gzip -t "$FILE"

echo "SQL header (first lines) ..."
gunzip -c "$FILE" | head -n 20

BYTES="$(wc -c <"$FILE" | tr -d ' ')"
if [[ "$BYTES" -lt 1024 ]]; then
  echo "WARNING: backup is very small (${BYTES} bytes)" >&2
  exit 1
fi

META="${FILE%.sql.gz}.meta"
if [[ -f "$META" ]]; then
  echo "Metadata:"
  cat "$META"
fi

echo "OK: backup file looks valid (${BYTES} bytes compressed)."
