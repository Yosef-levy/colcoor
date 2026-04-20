#!/usr/bin/env bash
# Rotate JWT_SECRET in .env and recreate the backend container so it picks up the new value.
#
# Effect: all existing Colcoor JWTs become invalid until each user signs in again.
#         Conversation data in Postgres is unchanged.
#
# Usage:
#   ./scripts/07-rotate-jwt-secret.sh
#   ./scripts/07-rotate-jwt-secret.sh --no-restart   # only update .env; you restart backend yourself
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NO_RESTART=0
for arg in "$@"; do
  if [[ "$arg" == "--no-restart" ]]; then
    NO_RESTART=1
  fi
done

ENV_FILE="$ROOT/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing .env. Run ./scripts/01-setup-env.sh first." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required." >&2
  exit 1
fi

NEW_SECRET="$(openssl rand -hex 48)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$ROOT/.env.bak.before-jwt-rotate.${STAMP}"

cp -a "$ENV_FILE" "$BACKUP"
echo "Backed up .env to $BACKUP"

TMP="$ROOT/.env.tmp.$$"
if grep -q '^JWT_SECRET=' "$ENV_FILE"; then
  # Replace first JWT_SECRET= line only; keep other lines intact.
  awk -v new="JWT_SECRET=${NEW_SECRET}" '
    BEGIN { done = 0 }
    /^JWT_SECRET=/ {
      if (done == 0) print new
      done = 1
      next
    }
    { print }
    END {
      if (done == 0) exit 1
    }
  ' "$ENV_FILE" >"$TMP"
else
  echo "No JWT_SECRET= line in .env; appending." >&2
  cat "$ENV_FILE" >"$TMP"
  printf '\nJWT_SECRET=%s\n' "$NEW_SECRET" >>"$TMP"
fi

mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Updated JWT_SECRET in .env (new value is not printed)."
echo "Users must use Colcoor: Sign in again after this rotation."

if [[ "$NO_RESTART" -eq 1 ]]; then
  echo "Skipped container restart (--no-restart). Recreate backend yourself, e.g.:"
  echo "  docker compose -f \"$ROOT/docker-compose.yml\" up -d --no-deps --force-recreate backend"
  exit 0
fi

echo "Recreating backend container to load new JWT_SECRET ..."
docker compose -f "$ROOT/docker-compose.yml" up -d --no-deps --force-recreate backend
echo "Done. Verify: ./scripts/05-health-check.sh"
