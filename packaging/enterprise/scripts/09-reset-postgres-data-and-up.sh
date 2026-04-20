#!/usr/bin/env bash
# Fix "password authentication failed for user colcoor" when .env was regenerated or Postgres
# was left over from another password: remove THIS compose project's Postgres volume, then up.
#
# Your existing .env is kept (same POSTGRES_PASSWORD / DATABASE_URL). Postgres re-initializes on
# next start and matches that .env. All Colcoor data in that volume is lost.
#
# Non-interactive gate (required):
#   COLCOOR_I_UNDERSTAND_DELETE_DB=1 ./scripts/09-reset-postgres-data-and-up.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "Missing .env. Run ./scripts/01-setup-env.sh first." >&2
  exit 1
fi

if [[ "${COLCOOR_I_UNDERSTAND_DELETE_DB:-}" != "1" ]]; then
  cat >&2 <<'EOF'
This removes the Docker volume that holds Postgres data for THIS stack, then runs stack-up.

Use only when logs show password authentication errors after changing secrets without wiping
the database volume, or when re-running 01-setup-env.sh --force without ./scripts/03-stack-down.sh --remove-volumes.

To proceed, run:

  COLCOOR_I_UNDERSTAND_DELETE_DB=1 ./scripts/09-reset-postgres-data-and-up.sh
EOF
  exit 1
fi

"$ROOT/scripts/03-stack-down.sh" --remove-volumes
"$ROOT/scripts/02-stack-up.sh"
echo "Done. Check: ./scripts/05-health-check.sh"
