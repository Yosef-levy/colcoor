# GCP provisioning (Colcoor multi-VM)

Scripts under [`scripts/gcp/`](../scripts/gcp/) create **Cloud SQL Postgres**, **Memorystore Redis**, a **GCS image bucket**, **PgBouncer pool sizing**, and an optional **HTTP load balancer**. They merge settings into **`shared.env`** (mode `600`, never commit).

**Orchestrator:** [`scripts/gcp/provision-infra.sh`](../scripts/gcp/provision-infra.sh)  
**Deploy integration:** [`scripts/deploy-multi-vm.sh`](../scripts/deploy-multi-vm.sh) (`provision-gcp`, `deploy-primary`, `deploy-replica`)

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **gcloud CLI** | Logged in: `gcloud auth login` |
| **Project billing** | APIs enabled automatically by `provision-infra.sh` |
| **GCE API VMs** | Same VPC as Cloud SQL / Redis (default network or your `COLCOOR_GCP_NETWORK`) |
| **VM service account** | Used for GCS `objectAdmin`; set in config or inferred from first API VM name |
| **Compose overlay** | [`docker-compose.prod.gcp.yml`](../docker-compose.prod.gcp.yml) disables bundled Postgres/Redis |

---

## Quick start (from repo root on primary VM)

```bash
cp scripts/gcp/gcp.env.example scripts/gcp/gcp.env
# Edit: COLCOOR_GCP_PROJECT, COLCOOR_GCS_BUCKET, COLCOOR_API_VM_INSTANCES, …

./scripts/deploy-multi-vm.sh deploy-primary \
  --config scripts/gcp/gcp.env \
  --shared-env ./shared.env
```

This runs, in order:

1. **`provision-infra.sh`** — Cloud SQL, Redis, GCS, JWT (if missing), pool sizing → `shared.env`
2. **`write-env --role=primary`**
3. **`migrate`**
4. **`docker compose -f docker-compose.prod.yml -f docker-compose.prod.gcp.yml up -d --build`**

After primary is healthy, copy `shared.env` to replica VMs:

```bash
./scripts/deploy-multi-vm.sh deploy-replica --shared-env ./shared.env
```

Add load balancer (VMs must exist and nginx must serve `/ready` on :80):

```bash
./scripts/gcp/provision-load-balancer.sh --config scripts/gcp/gcp.env
# Or: deploy-primary ... --with-lb
```

---

## Scripts reference

| Script | Purpose |
|--------|---------|
| [`provision-infra.sh`](../scripts/gcp/provision-infra.sh) | Enable APIs; run Cloud SQL + Redis + GCS + pool sizing |
| [`provision-cloudsql.sh`](../scripts/gcp/provision-cloudsql.sh) | Cloud SQL Postgres (private IP), DB/user, `DATABASE_*` URLs |
| [`provision-redis.sh`](../scripts/gcp/provision-redis.sh) | Memorystore Redis → `REDIS_URL` |
| [`provision-gcs.sh`](../scripts/gcp/provision-gcs.sh) | Bucket + `objectAdmin` for API service account |
| [`size-db-pools.sh`](../scripts/gcp/size-db-pools.sh) | `DB_*` and `PGBOUNCER_*` from replica/worker counts |
| [`provision-load-balancer.sh`](../scripts/gcp/provision-load-balancer.sh) | Global HTTP LB, `/ready` health check, instance group |

All support **`--dry-run`** where applicable.

Config template: [`scripts/gcp/gcp.env.example`](../scripts/gcp/gcp.env.example)

---

## What lands in `shared.env`

| Variable | Source |
|----------|--------|
| `POSTGRES_*`, `PGBOUNCER_POSTGRES_HOST` | Cloud SQL |
| `DATABASE_URL` | App → PgBouncer in Compose (`pgbouncer:6432`) |
| `DATABASE_MIGRATION_URL` | Alembic → Cloud SQL private IP |
| `REDIS_URL` | Memorystore |
| `GCS_BUCKET`, `COLCOOR_IMAGE_STORAGE=gcs` | GCS script |
| `JWT_SECRET` | Generated if missing |
| `DB_POOL_*`, `PGBOUNCER_*`, `WEB_CONCURRENCY` | `size-db-pools.sh` |

---

## VPC / private IP

Cloud SQL uses **private IP** only (`--no-assign-ip`). `provision-cloudsql.sh` allocates a **VPC peering range** and connects **servicenetworking** if missing.

API VMs must reach:

- Cloud SQL private IP (via PgBouncer container)
- Memorystore Redis host (same VPC)

---

## Load balancer

- Health check: **`GET /ready`** on port **80** (nginx)
- Firewall: Google health-check ranges → instances tagged **`colcoor-api`** (configurable)
- SSE: backend service timeout **120s** (extension reconnects if shorter)

Set extension **`colcoor.backendBaseUrl`** to the LB IP printed by the script.

---

## Idempotency

Re-running scripts is safe: existing Cloud SQL / Redis / bucket are skipped; passwords may be **reset** for the SQL user when the script runs `set-password` (use `--dry-run` to preview).

---

## Related docs

- [multi-vm-deploy.md](multi-vm-deploy.md) — full multi-VM runbook
- [image-storage.md](image-storage.md) — GCS contract and IAM
- [pgbouncer.md](pgbouncer.md) — pool theory (sizing automated by `size-db-pools.sh`)
