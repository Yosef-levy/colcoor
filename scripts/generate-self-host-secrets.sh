#!/usr/bin/env bash
# Append-safe secret suggestions for self-host .env (does not overwrite existing .env).
set -euo pipefail

jwt_secret="$(openssl rand -hex 48)"
postgres_password="$(openssl rand -hex 32)"

cat <<EOF
# --- Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ") — review before committing ---
JWT_SECRET=${jwt_secret}
POSTGRES_PASSWORD=${postgres_password}
DATABASE_URL=postgresql+asyncpg://colcoor:${postgres_password}@pgbouncer:6432/colcoor
DATABASE_MIGRATION_URL=postgresql+psycopg://colcoor:${postgres_password}@postgres:5432/colcoor
EOF
