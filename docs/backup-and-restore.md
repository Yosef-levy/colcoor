# Backup and restore

## GCP production (Cloud SQL)

Customer deployments use **Cloud SQL Postgres**, not a Postgres container on the VM.

| Action | Command |
|--------|---------|
| On-demand logical export to GCS | `./scripts/gcp/backup-cloudsql.sh --config ./gcp.env` (in the customer bundle) |
| Automated backups | Enable in GCP Console or `gcloud sql instances patch INSTANCE --backup-start-time=03:00` |
| Restore drill | Import to a **non-production** instance: `gcloud sql import sql …` |

See bundle **`README.md`** § Backups. GCS image bytes remain a **separate** backup (bucket versioning or `gcloud storage` sync).

---

## Local development (bundled Postgres)

Simple, operator-run **logical backups** (`pg_dump` + gzip) for the **development Docker Compose** stack. Not used in GCP production bundles.

For managed Postgres, prefer provider backups; the scripts below are the logical equivalent of `pg_dump` / restore drills on a dev machine.

---

## Important: Postgres-only backup is incomplete in production

> **Warning:** When production uses **GCS** for conversation images (`GCS_BUCKET`, `COLCOOR_IMAGE_STORAGE=gcs`), a Postgres dump is **only half** of application state.
>
> - Postgres stores **`conversation_images` metadata** (`object_key`, MIME type, size).
> - **Image bytes** live in the **GCS bucket**, not in the database.
>
> **Restoring Postgres without restoring or syncing the GCS bucket** (or without bucket versioning that still holds the objects) will leave **broken image references**: rows exist, but `GET …/images/{id}` may 404 or redirect to missing objects.
>
> **You must back up and restore GCS separately** (versioning, `gsutil rsync`, or provider backup). See [GCS images (production)](#gcs-images-production) below and [image-storage.md](image-storage.md).

---

## What must be backed up

| Asset | Where it lives | Backup method |
|-------|----------------|---------------|
| **PostgreSQL** (users, conversations, events, side chat, image **metadata**) | Docker volume `colcoor_postgres_data` | **Daily `pg_dump`** (scripts below) |
| **Conversation image bytes** | **GCS bucket** in production (`GCS_BUCKET`) | **Separate** — not in Postgres dumps |
| **Redis** | In-memory / no persistence in prod compose | **No backup** (side-chat wake only) |
| **`.env` secrets** | Host file (not in git) | Password manager / vault; **never** commit |
| **JWT signing** | `JWT_SECRET` in `.env` | Same as `.env` |
| **TLS certs** | Host (e.g. Let’s Encrypt) | Certbot / host backup |
| **Prometheus / Grafana** (optional profile) | Volumes `prometheus_data`, `grafana_data` | Optional |

---

## Scripts

| Script | Purpose |
|--------|---------|
| [`scripts/backup-postgres.sh`](../scripts/backup-postgres.sh) | Dev Compose: daily gzip dump + retention |
| [`scripts/restore-postgres.sh`](../scripts/restore-postgres.sh) | Dev Compose: restore into clean DB (guarded) |
| [`scripts/verify-backup-postgres.sh`](../scripts/verify-backup-postgres.sh) | Dev Compose: `gzip -t` + sanity checks |
| [`scripts/gcp/backup-cloudsql.sh`](../scripts/gcp/backup-cloudsql.sh) | **GCP production:** Cloud SQL export to GCS |

### Restore safety (scripts)

- **No restore** without `--confirm`.
- **No production restore** when `COLCOOR_ENV=production` in `.env` without `COLCOOR_RESTORE_CONFIRM=YES`.
- Before destructive steps, the restore script prints **compose file**, **project directory**, **postgres service**, and **database name**.

---

## Minimal production plan

### 1. Daily Postgres dump

```bash
./scripts/backup-postgres.sh
```

- Output: `./backups/colcoor-postgres-<UTC-timestamp>.sql.gz`
- Compression: `gzip -9`
- Retention: **14 days** (`COLCOOR_BACKUP_RETENTION_DAYS`)
- Dump uses the **`postgres`** Compose service (not PgBouncer).

### 2. Off-machine copy

```bash
export COLCOOR_BACKUP_OFFSITE='backup@backup.example:/var/backups/colcoor/'
./scripts/backup-postgres.sh
```

### GCS images (production)

Pick one:

- **GCS bucket versioning** (simplest)
- Nightly `gsutil -m rsync -r gs://YOUR_BUCKET gs://YOUR-BUCKET-backup`
- Cloud provider backup policy on the bucket

### 4. Retention (suggested)

| Tier | Retention | Where |
|------|-----------|--------|
| On-VM dumps | 14 days | `COLCOOR_BACKUP_RETENTION_DAYS` |
| Offsite | 30–90 days | Backup server / object store |
| GCS | Per org policy | Versioning or cross-region bucket |

### 5. Backup verification

```bash
./scripts/verify-backup-postgres.sh --file ./backups/colcoor-postgres-YYYYMMDDTHHMMSSZ.sql.gz
```

Run the **restore drill** (below) at least quarterly on **staging**, not on live production.

---

## Restore drill (staging)

Use a **clean staging VM** (or local machine) to prove you can recover. Do **not** run this against live production without a maintenance window and the confirmation env vars.

### Prerequisites

1. Copy a recent `colcoor-postgres-*.sql.gz` to the staging host (offsite copy).
2. If production uses GCS, **sync or point staging at a bucket copy** that matches the dump’s era (same objects as `conversation_images.object_key` values).
3. Staging `.env`: new secrets are fine, but **database credentials** must match what you configure in Compose; set `COLCOOR_ENV=development` on staging unless you intentionally test production guards.

### Steps

1. **Prepare a clean environment**

   ```bash
   git clone <repo> && cd colcoor
   cp .env.example .env   # edit: DATABASE_URL, REDIS_URL, GCS_BUCKET or local images, JWT_SECRET
   docker compose -f docker-compose.prod.yml up -d --build
   ```

   Or use local dev Compose with a **fresh** Postgres volume.

2. **Restore the dump**

   ```bash
   ./scripts/restore-postgres.sh \
     --file ./backups/colcoor-postgres-<timestamp>.sql.gz \
     --confirm \
     --stop-stack
   ```

   Read the printed **compose file** and **database** lines before the script proceeds.

3. **Run migrations if needed**

   If the dump is from an **older** schema than the backend image you deployed:

   ```bash
   # Single VM, or once per release before restarting multiple API VMs:
   docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
   # Or (recommended with shared.env / multi-VM): see docs/multi-vm-deploy.md
   ./scripts/deploy-multi-vm.sh migrate --shared-env ./shared.env
   ```

   If the dump already matches the deployed image version, skip this step. With **multiple API VMs**, run migrations **once** (primary or `deploy-multi-vm.sh migrate`); replicas should use **`COLCOOR_RUN_MIGRATIONS=false`** — [multi-vm-deploy.md](multi-vm-deploy.md).

4. **Start the backend** (if not already up from `--stop-stack`)

   ```bash
   docker compose -f docker-compose.prod.yml up -d backend
   ```

5. **Call `/ready`**

   ```bash
   curl -fsS http://127.0.0.1/ready
   ```

   Expect JSON with `"status":"ready"` and `"database":"ok"`, `"redis":"ok"`, `"storage":"ok"`.

6. **Smoke-test the product**

   - Sign in via the extension against the staging API (or use a test JWT).
   - **Create or open a conversation** (list conversations, open one).
   - **Side chat:** post a message; optional SSE stream check.
   - **Images (if GCS/local configured):** upload an image on a thread, or open an existing conversation that had images in the dump and confirm `GET …/images/{id}` works (redirect or bytes).

7. **Record results**

   Note dump date, image bucket sync method, migration run (yes/no), and any failures.

---

## Cron example (VM)

```cron
# /etc/cron.d/colcoor-backup
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin

15 2 * * * deploy cd /opt/colcoor && ./scripts/backup-postgres.sh >>/var/log/colcoor-backup.log 2>&1
30 2 * * * deploy rsync -a /opt/colcoor/backups/ backup@backup.example:/var/backups/colcoor/
```

---

## Production restore (emergency)

**Warning:** drops and recreates the database.

```bash
export COLCOOR_RESTORE_CONFIRM=YES

./scripts/restore-postgres.sh \
  --file ./backups/colcoor-postgres-20260518T021500Z.sql.gz \
  --confirm \
  --stop-stack
```

After restore:

```bash
curl -fsS http://127.0.0.1/ready
```

Confirm **GCS objects** exist for restored `conversation_images` rows before declaring success.

---

## Local test (dev compose)

```bash
docker compose up -d postgres

COMPOSE_FILE=docker-compose.yml ./scripts/backup-postgres.sh

COMPOSE_FILE=docker-compose.yml ./scripts/restore-postgres.sh \
  --file ./backups/colcoor-postgres-<timestamp>.sql.gz \
  --confirm
```

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `COMPOSE_FILE` | `docker-compose.prod.yml` | Compose file path |
| `COLCOOR_BACKUP_DIR` | `./backups` | Local dump directory |
| `COLCOOR_BACKUP_RETENTION_DAYS` | `14` | Delete older dumps |
| `COLCOOR_BACKUP_OFFSITE` | — | Optional `rsync` destination |
| `COLCOOR_RESTORE_CONFIRM` | — | Must be `YES` for production restore |

---

## What we intentionally skip

- **PITR / WAL archiving** — add later if RPO requires sub-hour recovery.
- **Volume snapshot-only backups** — logical dumps are portable across Postgres minor versions.
- **Secrets in `backups/`** — keep `.env` in a vault only.

---

## Related docs

- [production.md](production.md)
- [image-storage.md](image-storage.md)
- [pgbouncer.md](pgbouncer.md)
