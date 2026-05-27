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
| `docs/gce-api-vms.md` | VM count, sizing, and required properties by expected users |
| `shared.env` | Created by you — **same file on every API VM** (never commit) |

---

## Prerequisites

1. **GCP project** with billing enabled.
2. **`gcloud` CLI** installed and authenticated (`gcloud auth login`).
3. **Two or more GCE VMs** (same VPC / region) with:
   - Docker Engine + Docker Compose v2
   - HTTP **port 80** open (for nginx and load balancer health checks)
   - VM **OAuth scope** **`cloud-platform`** on **every** API VM (required for GCS upload **and** signed URL image viewing — see Step 1)
   - VM service account with **`roles/storage.objectAdmin`** on the image bucket (granted in Step 5)
4. **Operator machine** (can be your laptop) with `gcloud` for steps that create Cloud SQL, Redis, and GCS — or run those scripts on the primary VM.
5. **Cursor** on user machines to install the `.vsix`.

---

## Step 1 — Create GCE VMs (first time)

**Planning:** how many VMs, machine types, and required properties for your expected user load — see **[docs/gce-api-vms.md](docs/gce-api-vms.md)**.

Create at least **two** VMs in the same region and VPC. Example (small tier, 2 VMs):

```bash
gcloud compute instances create colcoor-api-1 colcoor-api-2 \
  --project=YOUR_PROJECT \
  --zone=us-central1-a \
  --machine-type=e2-standard-2 \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-balanced \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --tags=colcoor-api,http-server \
  --scopes=https://www.googleapis.com/auth/cloud-platform
```

**VM OAuth scopes (required on every API VM):** Colcoor uses the **attached service account** via the metadata server for GCS **upload**, **readiness**, and **signed URL** generation (`IAM signBlob`). Use **`cloud-platform`** — **Storage read/write alone is not enough** to view images.

| Setting | gcloud (create / set-service-account) | Google Cloud Console |
|---------|--------------------------------------|----------------------|
| **Recommended** | `--scopes=https://www.googleapis.com/auth/cloud-platform` | **Allow full access to all Cloud APIs** |
| **Per-API (Console)** | — | **Set access for each API** → **Cloud Platform → Enabled** (you may also set **Storage → Read Write**, but **Cloud Platform must be Enabled**) |

**Do not** use **Storage → Read Write** without **Cloud Platform → Enabled**: uploads may work, but **viewing images fails** with `ACCESS_TOKEN_SCOPE_INSUFFICIENT` on `IAMCredentials.SignBlob` in backend logs.

If scopes are too narrow, `/ready` may still report `"storage":"ok"`, but **upload** can fail with `Provided scope(s) are not authorized`, or **GET image** with `insufficient authentication scopes` on `signBlob`.

**Fix scopes on VMs already created (Google Cloud Console):**

1. **Compute Engine → VM instances** → **Stop** the VM.
2. Open the VM → **Edit**.
3. **Identity and API access** → **Access scopes**:
   - **Allow full access to all Cloud APIs**, **or**
   - **Set access for each API** → **Cloud Platform → Enabled** (add **Storage → Read Write** if you use per-API mode).
4. **Save** → **Start** the VM → wait for `docker compose` / Colcoor to come back.

Repeat for **every** API VM (primary **and** replicas). You can also use `gcloud compute instances set-service-account … --scopes=cloud-platform` while stopped (see [docs/gce-api-vms.md](docs/gce-api-vms.md)).

**GCS signed URLs (once per GCP project):** Viewing conversation images (`GET …/images/{id}`) uses **IAM `signBlob`** on the VM service account. This is **project-level IAM**, not something you configure inside each VM. **`create-shared-env.sh` (Step 5) grants it automatically** when run from a machine with `gcloud` admin access. If you set up VMs before that script, or view images fail with `private key to sign credentials` in logs, do the following **once in the project** (Google Cloud Console or Cloud Shell — not SSH on the VM):

1. **APIs & Services → Library** → enable **IAM Service Account Credentials API**.
2. **IAM & Admin → Service Accounts** → open the API VM service account (on a VM: `curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email` to read the email).
3. **Permissions → Grant access** → principal = **that same service account email** → role = **Service Account Token Creator** → Save.

If primary and replica VMs use **different** service accounts, repeat step 3 for each distinct account. If both VMs share the default compute service account (`…-compute@developer.gserviceaccount.com`), **one** binding covers both. Details: [docs/gce-api-vms.md](docs/gce-api-vms.md) § GCS signed URLs.

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
chmod 600 gcp.env
```

Edit **`gcp.env`** with **planned names and settings** for managed resources. Nothing below needs to exist in GCP yet except the API VMs from Step 1 — **Step 5 creates** Cloud SQL, Memorystore, and GCS (and optionally the load balancer) from these values:

| Variable | What to set |
|----------|-------------|
| `COLCOOR_GCP_PROJECT` | Your GCP project ID (must exist) |
| `COLCOOR_GCP_REGION` / `COLCOOR_GCP_ZONE` / `COLCOOR_GCP_NETWORK` | Same region, zone, and VPC as your API VMs |
| `COLCOOR_API_VM_INSTANCES` | Comma-separated VM names from Step 1 (must exist) |
| `COLCOOR_CLOUDSQL_INSTANCE` | Planned Cloud SQL instance name (e.g. `colcoor-prod`) |
| `COLCOOR_CLOUDSQL_TIER` | Instance size — see [docs/gce-api-vms.md](docs/gce-api-vms.md) |
| `COLCOOR_REDIS_INSTANCE` | Planned Memorystore Redis name (e.g. `colcoor-redis`) |
| `COLCOOR_GCS_BUCKET` | Planned GCS bucket name (globally unique, e.g. `your-project-colcoor-images`) |
| `COLCOOR_LB_NAME` | Planned HTTP load balancer name (used with `--with-lb` or Step 8) |
| `COLCOOR_POSTGRES_DB`, `COLCOOR_POSTGRES_USER` | Database and user to create inside Cloud SQL |

`create-shared-env.sh` creates any of the above that are missing, grants GCS IAM, sizes connection pools, and writes **`shared.env`**. To reuse resources you created outside this bundle, set the same names in `gcp.env`; existing resources are left unchanged.

---

## Step 5 — Create shared infrastructure and `shared.env`

Run **once** before starting the API on any VM. Prefer your **operator laptop** (or Cloud Shell) with a **user account** that can create Cloud SQL, Redis, and Storage — not the API VM’s default compute service account.

```bash
./scripts/create-shared-env.sh
```

This creates **Cloud SQL**, **Memorystore Redis**, **GCS bucket + IAM**, pool sizing, and **`shared.env`** (secrets and connection URLs).

Requires **`gcloud`** and permission to create SQL, Redis, Storage, and Compute resources.

Optional HTTP load balancer (after VMs run nginx):

```bash
./scripts/create-shared-env.sh --with-lb
```

**Permission error** (`ACCESS_TOKEN_SCOPE_INSUFFICIENT`, `does not have permission`, or active account is `*-compute@developer.gserviceaccount.com`):

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT
gcloud auth list
```

Use the **`COLCOOR_GCP_PROJECT`** value from `gcp.env` instead of `YOUR_PROJECT`. Confirm your **user email** is active (not the VM service account), then re-run `./scripts/create-shared-env.sh`. Copy the resulting **`shared.env`** to each API VM before Step 6.

If APIs are already enabled on the project, you can skip that step: `./scripts/create-shared-env.sh --skip-apis`

**Cloud SQL tier error** (`Invalid Tier (db-custom-…) for (ENTERPRISE_PLUS) Edition`): GCP defaults to **Enterprise Plus**, which does not accept `db-custom-*` tiers. Either keep `COLCOOR_CLOUDSQL_TIER=db-custom-2-7680` (the script passes `--edition=ENTERPRISE`), or switch to Enterprise Plus tiers such as `db-perf-optimized-N-2` in `gcp.env`.

**Cloud SQL `INTERNAL_ERROR` on create:** Often private IP / VPC peering. Wait 2–3 minutes after the first run, then retry with `--skip-apis`. Check for a failed instance in Cloud Console → SQL and **delete** it before retrying. Verify peering:

```bash
gcloud compute addresses describe google-managed-services-default --global --project=YOUR_PROJECT
gcloud services vpc-peerings list --network=default --project=YOUR_PROJECT
```

Use your `COLCOOR_GCP_NETWORK` instead of `default` if different. The script passes `--allocated-ip-range-name=google-managed-services-<network>` to match the peering range. If it still fails, create once manually in Console (private IP, same VPC) or open a GCP support ticket — `INTERNAL_ERROR` is often transient on Google's side.

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

**Before upgrading:** back up **`shared.env`** (and **`gcp.env`** if present). They hold secrets and connection URLs not stored elsewhere — losing them means reconstructing Cloud SQL / Redis / GCS settings and rotating **`JWT_SECRET`** (which invalidates existing user sessions). Copy to a secure location (password manager, Secret Manager, encrypted offline copy); mode **600**.

```bash
cp -a shared.env "shared.env.bak.$(date -u +%Y%m%d)"
chmod 600 shared.env.bak.*
```

On one machine with `shared.env` and the new bundle:

```bash
./scripts/00-load-images.sh
./scripts/deploy-multi-vm.sh migrate --shared-env ./shared.env
```

Rolling restart: **primary** first, then **replicas** (`deploy-primary.sh` / `deploy-replica.sh` or `docker compose up -d`).

---

## Backups

**`shared.env`:** back up before upgrades or VM rebuilds (see **Upgrades** above). Same file must exist on every API VM; treat loss as a production incident.

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
| Image upload HTTP 500, log `Provided scope(s) are not authorized` | VM scope missing GCS write — **Cloud Platform → Enabled** (Step 1) on **that** VM |
| View image HTTP 500, log `ACCESS_TOKEN_SCOPE_INSUFFICIENT` / `SignBlob` | Same VM needs **Cloud Platform → Enabled** (Storage-only scope is not enough); fix **every** replica |
| View image HTTP 500, log `private key to sign credentials` | **Project-level:** enable **IAM Service Account Credentials API**; grant SA **Service Account Token Creator** on itself; redeploy backend with GCS signBlob fix |
| Auth works on one VM only | `JWT_SECRET` must match in `shared.env` on all VMs |
| `Permission denied` on scripts | `chmod +x scripts/*.sh scripts/gcp/*.sh` or re-extract `.tar.gz` |

Backend logs: `docker compose logs -f backend`

---

## Security

- Do **not** commit or email `shared.env`, `gcp.env`, or `.env`.
- Restrict firewall to port **80/443** on API VMs; do not expose Postgres or Redis publicly (they are managed services with private IPs).
