Colcoor enterprise bundle (backend image + extension VSIX + Docker Compose)
================================================================================

Contents
--------
  colcoor-backend-*.tar.gz     Pre-built API image (load with script 00).
  colcoor-extension-*.vsix     Cursor / VS Code extension installer.
  docker-compose.yml           Stack: nginx, backend (pre-loaded image), Postgres.
  nginx/nginx.conf             Reverse proxy config.
  scripts/                     Operator helpers (run from this directory).


Prerequisites on the server
---------------------------
  Docker Engine + Docker Compose v2 (plugin "docker compose").
  Open inbound TCP 80 (and 443 when you add TLS in nginx + compose).
  openssl (for secret generation in 01-setup-env.sh).

  Postgres data uses a Compose project volume (name includes this folder / project). You can
  run multiple Colcoor stacks on one host if they live in different directories (different projects).


Typical first-time install (on the VM)
---------------------------------------
  cd /path/to/this-bundle

  ./scripts/00-load-image.sh
  ./scripts/01-setup-env.sh
  ./scripts/02-stack-up.sh
  ./scripts/05-health-check.sh

  Archive credentials.generated.txt securely, then delete it from the server
  if your policy requires (the same values are already in .env).


Extension machines
------------------
  Install the .vsix (Cursor: Install from VSIX).
  Set Settings -> Colcoor -> Backend base URL to your API origin, e.g.:
    http://YOUR_SERVER_IP
  (no trailing slash, no /api/v1). Use https:// when TLS is enabled on nginx.


Day-2 operations
----------------
  ./scripts/04-stack-restart.sh       Recreate containers (keeps Postgres volume).
  ./scripts/03-stack-down.sh          Stop stack (data kept unless --remove-volumes).
  ./scripts/06-backup-postgres.sh     Logical dump to ./backups/
  ./scripts/07-rotate-jwt-secret.sh   New JWT signing secret + backend recreate; users re-sign in (data unchanged).


Regenerating secrets (01-setup-env.sh --force)
----------------------------------------------
  Only on a fresh database or after ./scripts/03-stack-down.sh --remove-volumes.
  Otherwise Postgres still has the old password and the new DATABASE_URL will not match.


Compose note
------------
  If "pull_policy" is unsupported, remove the pull_policy line under service "backend"
  in docker-compose.yml, or upgrade Docker Compose.


Backend container unhealthy
---------------------------
  Inspect API / migration errors:

    ./scripts/08-show-backend-logs.sh --tail=200

  Common causes:
  - Stale global volume: an older Colcoor compose used a host-wide volume name and a different
    Postgres password than your current .env. Current bundles use a project-scoped volume instead.
    Fix: ./scripts/03-stack-down.sh then remove the orphan volume only if you accept data loss:
      docker volume ls | grep colcoor
      docker volume rm <name>    # e.g. colcoor_postgres_data from an old project
    Then ./scripts/02-stack-up.sh again (Postgres re-initializes from your current .env).
  - Regenerated .env (01-setup-env.sh --force) without wiping the DB volume — see section above
    "Regenerating secrets".
