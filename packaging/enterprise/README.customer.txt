Colcoor enterprise bundle (backend image + extension VSIX + Docker Compose)
================================================================================

Contents
--------
  colcoor-backend-*.tar.gz     Pre-built API image (load with script 00).
  colcoor-pgbouncer-*.tar.gz   Pre-built PgBouncer image (load with script 00).
  colcoor-extension-*.vsix     Cursor / VS Code extension installer.
  docker-compose.yml           Stack: nginx, backend, PgBouncer, Postgres, Redis.
  pgbouncer/                   Pooler config (mounted by Compose).
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

  After you change the backend URL (or COLCOOR_API_URL), reload the editor window
  so the extension host picks it up: Command Palette -> "Developer: Reload Window".


Backend URL for the extension (important)
-----------------------------------------
  The URL in extension settings must be the backend machine's EXTERNAL reachable URL,
  not an internal Docker hostname like "backend" and not VM-local "127.0.0.1"
  (unless the extension runs on the same machine as Docker).

  Use one of:
    http://PUBLIC_IP
    http://PUBLIC_DNS_NAME
    https://PUBLIC_DNS_NAME   (recommended once TLS is enabled)

  Example:
    http://203.0.113.10

  Keep it as origin only: no trailing slash and no /api/v1 path.


Multiple API VMs (advanced)
---------------------------
  This bundle installs one stack per directory (single nginx + backend by default). To run
  several API VMs behind a load balancer with shared Postgres, Redis, and GCS, see the full
  repository docs/multi-vm-deploy.md and scripts/deploy-multi-vm.sh (shared.env,
  COLCOOR_RUN_MIGRATIONS=false on replicas, migrate once per release). Not automated in
  these bundle scripts.


Day-2 operations
----------------
  ./scripts/04-stack-restart.sh       Recreate containers (keeps Postgres volume).
  ./scripts/03-stack-down.sh          Stop stack (data kept unless --remove-volumes).
  ./scripts/06-backup-postgres.sh     Logical dump to ./backups/
  ./scripts/07-restore-postgres.sh    Restore from backup (destructive; see docs)
  ./scripts/07-rotate-jwt-secret.sh   New JWT signing secret + backend recreate; users re-sign in (data unchanged).


Regenerating secrets (01-setup-env.sh --force)
----------------------------------------------
  Only on a fresh database or after ./scripts/03-stack-down.sh --remove-volumes.
  Otherwise Postgres still has the old password and the new DATABASE_URL will not match.


Compose note
------------
  If "pull_policy" is unsupported, remove the pull_policy lines under services "backend" and "pgbouncer"
  in docker-compose.yml, or upgrade Docker Compose.


Troubleshooting: backend unhealthy / "password authentication failed for user colcoor"
-------------------------------------------------------------------------------------
  Postgres reads POSTGRES_PASSWORD only the first time its data volume is created. If you
  ran 01-setup-env.sh again (or used --force) while the Docker volume colcoor_postgres_data
  already existed, the new password in .env does not match the database.

  Fix (wipes Colcoor DB in that volume): ./scripts/03-stack-down.sh --remove-volumes
  Then: ./scripts/02-stack-up.sh   (keep the same .env so Postgres re-inits with matching secrets)

  If you need new random secrets after wiping the volume, run 01-setup-env.sh --force after
  down --remove-volumes, then ./scripts/02-stack-up.sh again.


Backend container unhealthy
---------------------------
  Inspect API / migration errors:

    ./scripts/08-show-backend-logs.sh --tail=200

  "password authentication failed for user colcoor" (often during alembic upgrade)
  ------------------------------------------------
  Postgres only reads POSTGRES_PASSWORD on **first** database initialization. If you changed
  .env (or ran 01-setup-env.sh --force) but kept the same Docker volume, the DB still has the
  old password while the backend uses the new DATABASE_URL.

  Fix (deletes Colcoor data for this stack only; keeps your current .env):

    COLCOOR_I_UNDERSTAND_DELETE_DB=1 ./scripts/09-reset-postgres-data-and-up.sh

  Or manually:

    ./scripts/03-stack-down.sh --remove-volumes
    ./scripts/02-stack-up.sh

  Other causes:
  - Stale global volume from an old compose file (name: colcoor_postgres_data): upgrade the
    bundle docker-compose.yml to a version without a fixed volume name, then down/up; or
    docker volume rm colcoor_postgres_data if nothing else needs it.
  - Regenerated .env without wiping the DB — same fix as above; see "Regenerating secrets".
