# Multi-VM deployment (shared Postgres, Redis, GCS)

This runbook implements the practical scale-out path for Colcoor: **one codebase, one backend image**, multiple API VMs behind a load balancer, with **shared Cloud SQL (or Postgres)**, **shared Redis**, and **GCS** for images.

**GCP automation:** [gcp-provisioning.md](gcp-provisioning.md) and **`./scripts/deploy-multi-vm.sh deploy-primary`**.

---

## From scratch on GCP (automated)

### 0. Prerequisites

- Two (or more) GCE VMs in the same VPC, Docker + Compose installed
- `gcloud` on the machine where you run provisioning (can be primary VM or laptop)
- Copy and edit **`scripts/gcp/gcp.env`** from [`scripts/gcp/gcp.env.example`](../scripts/gcp/gcp.env.example)

### 1. Primary VM — one command

```bash
./scripts/deploy-multi-vm.sh deploy-primary \
  --config scripts/gcp/gcp.env \
  --shared-env ./shared.env
```

Runs: **GCP infra** (Cloud SQL, Redis, GCS, pool sizing) → **write-env (primary)** → **migrate** → **compose up** (with [`docker-compose.prod.gcp.yml`](../docker-compose.prod.gcp.yml)).

Optional load balancer (API VMs must exist and serve nginx :80):

```bash
./scripts/deploy-multi-vm.sh deploy-primary \
  --config scripts/gcp/gcp.env \
  --shared-env ./shared.env \
  --with-lb
```

### 2. Replica VM(s)

Copy **`shared.env`** securely, then:

```bash
./scripts/deploy-multi-vm.sh deploy-replica --shared-env ./shared.env
```

### 3. Extension

Set **`colcoor.backendBaseUrl`** to the load balancer IP (or primary VM URL until LB exists).

---

## Manual / step-by-step (any cloud)

### Step 1 — Shared services

| Service | GCP script | Manual |
|---------|------------|--------|
| Postgres | `./scripts/gcp/provision-cloudsql.sh` | Cloud SQL / RDS |
| Redis | `./scripts/gcp/provision-redis.sh` | Memorystore / ElastiCache |
| Images | `./scripts/gcp/provision-gcs.sh` | GCS + IAM ([image-storage.md](image-storage.md)) |
| Pool sizing | `./scripts/gcp/size-db-pools.sh --shared-env ./shared.env` | [pgbouncer.md](pgbouncer.md) |
| Load balancer | `./scripts/gcp/provision-load-balancer.sh` | Provider LB → `/ready` |

Or all GCP services at once:

```bash
./scripts/deploy-multi-vm.sh provision-gcp \
  --config scripts/gcp/gcp.env \
  --shared-env ./shared.env
```

### Step 2 — Migrations

| Node | `COLCOOR_RUN_MIGRATIONS` |
|------|--------------------------|
| Primary | `true` (default) |
| Replica | `false` |

```bash
./scripts/deploy-multi-vm.sh migrate --shared-env ./shared.env
```

### Step 3 — Shared env

```bash
./scripts/deploy-multi-vm.sh extract-shared -o ./shared.env   # from existing .env
./scripts/deploy-multi-vm.sh write-env --role=primary --shared-env ./shared.env
```

Copy **`shared.env`** to every API VM (mode `600`, never commit).

### Step 4 — Compose on each VM

**GCP (managed DB/Redis):**

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.prod.gcp.yml up -d --build
```

**Bundled Postgres/Redis (single-VM / lab only):**

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Deploy script commands

[`scripts/deploy-multi-vm.sh`](../scripts/deploy-multi-vm.sh):

| Command | Purpose |
|---------|---------|
| `provision-gcp` | Cloud SQL + Redis + GCS + pools → `shared.env` |
| `deploy-primary` | `provision-gcp` (optional skip) + write-env + migrate + compose |
| `deploy-replica` | write-env (replica) + compose |
| `write-env` | Merge `shared.env` + role overrides → `.env` |
| `migrate` | One-shot Alembic |
| `extract-shared` | Strip per-node keys from `.env` |

---

## Per-node environment variables

| Variable | Primary | Replica |
|----------|---------|---------|
| `COLCOOR_RUN_MIGRATIONS` | `true` | `false` |
| `COLCOOR_EVENT_PURGE_SCHEDULER_ENABLED` | `true` | `false` |
| `COLCOOR_INSTANCE_ID` | hostname | hostname |

**Identical on all nodes:** `JWT_SECRET`, `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `REDIS_URL`, `GCS_*`, license vars.

---

## Upgrade workflow

```bash
./scripts/deploy-multi-vm.sh migrate --shared-env ./shared.env
# Rolling restart primary, then replicas
docker compose -f docker-compose.prod.yml -f docker-compose.prod.gcp.yml up -d --build
```

---

## Related docs

- [gcp-provisioning.md](gcp-provisioning.md) — GCP scripts detail
- [production.md](production.md) — Compose baseline
- [pgbouncer.md](pgbouncer.md) — pool theory
- [side-chat-realtime.md](side-chat-realtime.md) — Redis + SSE
