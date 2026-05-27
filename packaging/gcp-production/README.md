# Colcoor GCP production deployment

This bundle is the **only** supported customer deployment: **multiple GCE VMs** behind an optional **Google Cloud HTTP load balancer**, with **Cloud SQL Postgres**, **Memorystore Redis**, and **GCS** for conversation images.

Each API VM runs **nginx + backend + PgBouncer** (Docker Compose). There is **no** bundled Postgres or Redis on the VM.

---

## What is in this folder

| Item | Purpose |
|------|---------|
| `colcoor-backend-*.tar.gz` | Pre-built API image |
| `colcoor-pgbouncer-*.tar.gz` | PgBouncer image |
| `colcoor-extension-*.vsix` | Cursor / VS Code extension |
| `docker-compose.yml` | API stack on each VM |
| `gcp.env.example` | GCP project / resource names |
| `scripts/` | Operator scripts (load images, provision GCP, deploy) |
| `shared.env` | Created by you — **same file on every API VM** (never commit) |

---

## Prerequisites

1. **GCP project** with billing enabled.
2. **`gcloud` CLI** installed and authenticated (`gcloud auth login`).
3. **Two or more GCE VMs** (same VPC / region) with:
   - Docker Engine + Docker Compose v2
   - HTTP **port 80** open (for nginx and load balancer health checks)
   - A service account with access to **GCS** (for image uploads)
4. **Operator machine** (can be your laptop) with `gcloud` for steps that create Cloud SQL, Redis, and GCS — or run those scripts on the primary VM.
5. **Cursor** on user machines to install the `.vsix`.

---

## Step 1 — Create GCE VMs (first time)

Create at least **two** VMs in the same region and VPC, for example:

```bash
gcloud compute instances create colcoor-api-1 colcoor-api-2 \
  --project=YOUR_PROJECT \
  --zone=us-central1-a \
  --machine-type=e2-standard-2 \
  --tags=colcoor-api,http-server \
  --scopes=https://www.googleapis.com/auth/cloud-platform
```

Install Docker on each VM (see [Docker docs](https://docs.docker.com/engine/install/)).

Allow Google health checks to reach port 80 (the deploy scripts can create this rule when you add the load balancer).

---

## Step 2 — Unpack the bundle on each API VM

On **primary** and **replica** VMs:

```bash
sha256sum -c colcoor-gcp-production-BE*-EXT*.tar.gz.sha256
tar -xzf colcoor-gcp-production-BE*-EXT*.tar.gz
cd colcoor-gcp-production-BE*-EXT*
```

Use the **`.tar.gz`** archive (not zip) so script permissions are preserved.

---

## Step 3 — Load Docker images (each VM)

```bash
./scripts/00-load-images.sh
docker images | grep colcoor
```

---

## Step 4 — Configure GCP (`gcp.env`)

On the **primary** VM (or your operator laptop with this bundle):

```bash
cp gcp.env.example gcp.env
# Edit: COLCOOR_GCP_PROJECT, COLCOOR_GCS_BUCKET, COLCOOR_API_VM_INSTANCES, region/zone, …
chmod 600 gcp.env
```

---

## Step 5 — Create shared infrastructure and `shared.env`

Run **once** before starting the API on any VM:

```bash
./scripts/create-shared-env.sh
```

This creates **Cloud SQL**, **Memorystore Redis**, **GCS bucket + IAM**, pool sizing, and **`shared.env`** (secrets and connection URLs).

Requires **`gcloud`** and permission to create SQL, Redis, Storage, and Compute resources.

Optional HTTP load balancer (after VMs run nginx):

```bash
./scripts/create-shared-env.sh --with-lb
```

---

## Step 6 — Deploy primary API VM

On **VM 1** (primary):

```bash
./scripts/deploy-primary.sh
./scripts/health-check.sh
```

This writes `.env` from `shared.env`, runs database migrations once, and starts Compose.

---

## Step 7 — Deploy replica API VM(s)

Copy **`shared.env`** to VM 2+ securely (SCP, Secret Manager, etc.). **Mode 600. Same bytes on every VM.**

On each **replica** VM:

```bash
# same bundle unpacked, images loaded (step 2–3)
./scripts/deploy-replica.sh
./scripts/health-check.sh
```

Replicas skip migrations on container start (`COLCOOR_RUN_MIGRATIONS=false`).

---

## Step 8 — Load balancer (if not done in step 5)

If you skipped `--with-lb` earlier:

```bash
./scripts/gcp/provision-load-balancer.sh --config ./gcp.env
```

Note the **external IP** printed at the end.

---

## Step 9 — Install the extension

1. Install `colcoor-extension-*.vsix` in Cursor (Extensions → Install from VSIX).
2. Set **Colcoor → Backend base URL** to the load balancer IP or URL, e.g. `http://203.0.113.10` (no trailing slash, no `/api/v1`).
3. Reload the window (Command Palette → **Developer: Reload Window**).
4. Sign in from the Colcoor sidebar.

---

## Step 10 — Health check (final)

```bash
./scripts/health-check.sh
# Through load balancer (replace IP):
curl -fsS http://LOAD_BALANCER_IP/ready
```

Expect JSON with `"status":"ready"` and `"database":"ok"`, `"redis":"ok"`, `"storage":"ok"`.

---

## Upgrades (new backend version)

On one machine with `shared.env` and the new bundle:

```bash
./scripts/00-load-images.sh
./scripts/deploy-multi-vm.sh migrate --shared-env ./shared.env
```

Rolling restart: **primary** first, then **replicas** (`deploy-primary.sh` / `deploy-replica.sh` or `docker compose up -d`).

---

## Backups

PostgreSQL runs on **Cloud SQL**, not on the VM disk.

```bash
./scripts/gcp/backup-cloudsql.sh --config ./gcp.env
```

See `./scripts/gcp/backup-cloudsql.sh --help` for export to GCS. GCS image bytes are separate — use bucket versioning or `gcloud storage` sync for object backup.

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| `/ready` 503 database | `PGBOUNCER_POSTGRES_HOST`, Cloud SQL private IP, VPC |
| `/ready` 503 redis | `REDIS_URL`, Memorystore network |
| `/ready` 503 storage | `GCS_BUCKET`, VM service account `objectAdmin` |
| Auth works on one VM only | `JWT_SECRET` must match in `shared.env` on all VMs |
| `Permission denied` on scripts | `chmod +x scripts/*.sh scripts/gcp/*.sh` or re-extract `.tar.gz` |

Backend logs: `docker compose logs -f backend`

---

## Security

- Do **not** commit or email `shared.env`, `gcp.env`, or `.env`.
- Restrict firewall to port **80/443** on API VMs; do not expose Postgres or Redis publicly (they are managed services with private IPs).
