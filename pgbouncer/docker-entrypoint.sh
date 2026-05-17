#!/bin/sh
# Write auth file from Compose env, then start PgBouncer (official image).
set -eu

if [ -z "${POSTGRES_USER:-}" ] || [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "pgbouncer: POSTGRES_USER and POSTGRES_PASSWORD are required" >&2
  exit 1
fi

USERLIST=/etc/pgbouncer/userlist.txt
printf '"%s" "%s"\n' "$POSTGRES_USER" "$POSTGRES_PASSWORD" >"$USERLIST"
chmod 600 "$USERLIST"

# Writable copy so optional env overrides can patch pool sizing (see docs/pgbouncer.md).
INI_WORK=/tmp/pgbouncer.ini
cp /etc/pgbouncer/pgbouncer.ini "$INI_WORK"

if [ -n "${PGBOUNCER_MAX_CLIENT_CONN:-}" ]; then
  sed -i "s/^max_client_conn = .*/max_client_conn = ${PGBOUNCER_MAX_CLIENT_CONN}/" "$INI_WORK"
fi
if [ -n "${PGBOUNCER_DEFAULT_POOL_SIZE:-}" ]; then
  sed -i "s/^default_pool_size = .*/default_pool_size = ${PGBOUNCER_DEFAULT_POOL_SIZE}/" "$INI_WORK"
fi
if [ -n "${PGBOUNCER_RESERVE_POOL_SIZE:-}" ]; then
  sed -i "s/^reserve_pool_size = .*/reserve_pool_size = ${PGBOUNCER_RESERVE_POOL_SIZE}/" "$INI_WORK"
fi

exec pgbouncer "$INI_WORK"
