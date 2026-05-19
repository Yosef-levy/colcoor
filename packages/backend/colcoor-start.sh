#!/bin/sh
# Start Gunicorn; optionally run Alembic first (COLCOOR_RUN_MIGRATIONS, default true).
set -eu

_run_migrations() {
  case "${COLCOOR_RUN_MIGRATIONS:-true}" in
    0 | false | FALSE | no | NO | off | OFF)
      echo "colcoor: skipping alembic (COLCOOR_RUN_MIGRATIONS=false)"
      return 0
      ;;
  esac
  echo "colcoor: running alembic upgrade head"
  alembic upgrade head
}

_run_migrations

exec gunicorn colcoor_backend.main:app \
  -k uvicorn.workers.UvicornWorker \
  -w "${WEB_CONCURRENCY:-2}" \
  -b "0.0.0.0:${PORT:-8000}" \
  --timeout 120 \
  --graceful-timeout 30 \
  --keep-alive 5 \
  --access-logfile - \
  --error-logfile -
