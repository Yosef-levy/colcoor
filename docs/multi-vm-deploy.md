# Multi-VM deployment (shared Postgres, Redis, GCS)

This runbook implements the practical scale-out path for Colcoor: **one codebase, one backend image**, multiple API VMs behind a load balancer, with **shared Cloud SQL (or Postgres)**, **shared Redis**, and **GCS** for images.

For gap analysis and architecture notes, see the multi-VM scaling review in the repo history. This document is the **operator sequence**.

---

## Prerequisites (Profile A → Profile B)

### Step 1 — Single VM + managed data (Profile A)

Before adding a second API VM, move shared services off the app box when possible:

| Service | Recommendation |
|---------|----------------|
| **Postgres** | Cloud SQL / RDS; app uses **PgBouncer** or provider pooler (`DATABASE_URL` → pooler, `DATABASE_MIGRATION_URL` → direct) |
| **Redis** | Memorystore / ElastiCache; `REDIS_URL` required in production |
| **Images** | `COLCOOR_IMAGE_STORAGE=gcs` + `GCS_BUCKET` (required for multi-VM; local disk is single-node only) |
| **Secrets** | Strong `JWT_SECRET`; identical on every API VM |

Size pools using [pgbouncer.md](pgbouncer.md): roughly  
`client_connections ≈ API_VMs × WEB_CONCURRENCY × (DB_POOL_SIZE + DB_MAX_OVERFLOW)`.

### Step 2 — Operationalize migrations

Do **not** run `alembic upgrade head` on every replica at the same time.

| Node | `COLCOOR_RUN_MIGRATIONS` | Behavior |
|------|--------------------------|----------|
| **Primary** API VM | `true` (default) | Runs migrations on container start |
| **Replica** API VMs | `false` | Skips migrations; starts Gunicorn only |

For releases, prefer a **one-shot migrate** before roll-out:

```bash
./scripts/deploy-multi-vm.sh migrate --shared-env ./shared.env
```

Then start or restart backends (replicas with `COLCOOR_RUN_MIGRATIONS=false`).

### Step 3 — Shared env file

All API VMs must use the **same** `shared.env` for secrets and service URLs. Only per-node keys differ (see [deploy script](#deploy-script)).

```bash
# On primary, from a working single-VM .env:
./scripts/deploy-multi-vm.sh extract-shared -o ./shared.env
```

Copy `shared.env` to replica VMs over SSH or a secret manager (mode `600`, never commit).

### Step 4 — Add VM #2 behind a load balancer

1. LB health check: **`GET /ready`** on each backend instance (not only nginx `/health`).
2. Point both VMs at the same `DATABASE_URL`, `REDIS_URL`, `GCS_BUCKET`, `JWT_SECRET`.
3. `RATE_LIMIT_TRUST_PROXY=true` behind the LB/nginx.
4. Optional: increase LB/nginx **`proxy_read_timeout`** for side-chat SSE (extension reconnects if shorter; see [side-chat-realtime.md](side-chat-realtime.md)).

### Step 5 — Monitoring

- Scrape **`/metrics` on each API instance** (Compose `monitoring/prometheus.yml` uses a single `backend:8000` target — extend for multi-VM).
- JSON logs include optional **`instance_id`** when `COLCOOR_INSTANCE_ID` is set (deploy script sets hostname).

---

## Deploy script

[`scripts/deploy-multi-vm.sh`](../scripts/deploy-multi-vm.sh) commands:

| Command | Purpose |
|---------|---------|
| `extract-shared` | Build `shared.env` from `.env` (removes per-node keys) |
| `write-env --role=primary\|replica` | Write `.env` = shared + role overrides |
| `migrate` | One-shot `alembic upgrade head` using `DATABASE_MIGRATION_URL` |
| `role-vars` | Print role snippet |

### Primary VM (first API node)

```bash
cd /path/to/colcoor

# 1. Create shared.env (edit Cloud SQL / Redis / GCS / JWT before deploy)
cp .env.example shared.env
# ... edit shared.env ...

# 2. Node .env for primary
./scripts/deploy-multi-vm.sh write-env --role=primary --shared-env ./shared.env

# 3. Migrations once per release (recommended even if primary runs them on start)
./scripts/deploy-multi-vm.sh migrate --shared-env ./shared.env

# 4. Start stack
docker compose -f docker-compose.prod.yml up -d --build
curl -fsS http://127.0.0.1/ready
```

### Replica VM (second+ API node)

```bash
# Copy shared.env from primary (secure channel)
./scripts/deploy-multi-vm.sh write-env --role=replica --shared-env ./shared.env

docker compose -f docker-compose.prod.yml up -d --build
curl -fsS http://127.0.0.1/ready
```

### Upgrade workflow (new backend version)

```bash
# On any one machine with shared.env and compose:
./scripts/deploy-multi-vm.sh migrate --shared-env ./shared.env

# Rolling: update primary, then replicas (or LB drain)
# Primary .env: COLCOOR_RUN_MIGRATIONS=true (or rely on migrate above + false everywhere)
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Per-node environment variables

| Variable | Primary | Replica |
|----------|---------|---------|
| `COLCOOR_NODE_ROLE` | `primary` | `replica` |
| `COLCOOR_RUN_MIGRATIONS` | `true` | `false` |
| `COLCOOR_EVENT_PURGE_SCHEDULER_ENABLED` | `true` | `false` |
| `COLCOOR_INSTANCE_ID` | hostname | hostname |

**Must be identical on all nodes:** `JWT_SECRET`, `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `REDIS_URL`, `GCS_*`, license vars.

Purge scheduler on replicas is optional to disable (advisory lock already prevents duplicate work); the deploy script disables it on replicas to reduce idle wakeups.

---

## nginx / Compose notes

- Current [`nginx/nginx.conf`](../nginx/nginx.conf) has a **single** upstream (`backend:8000`). On one VM with two containers, add multiple `server` lines or use an external LB targeting each VM’s nginx/backend port.
- [`docker-compose.prod.yml`](../docker-compose.prod.yml) defines one `backend` service; multi-VM usually means **one compose stack per VM** (backend + nginx) or LB → backend port directly without per-VM Postgres/Redis containers.
- Remove bundled `postgres` / `redis` services from compose on cloud deployments; set URLs in `shared.env` to managed services.

---

## What is already multi-VM safe

- JWT auth (no sticky sessions)
- Side-chat SSE + Redis pub/sub
- GCS images
- PgBouncer-friendly asyncpg settings
- Event purge (Postgres advisory lock)

## Deferred improvements

- **Redis-backed rate limits** — today limits are per worker ([production.md](production.md))
- **Stricter license seat cap** — rare race at exact seat limit
- **Prometheus service discovery** for N backends

---

## Related docs

- [production.md](production.md) — single-VM Compose baseline
- [pgbouncer.md](pgbouncer.md) — pool sizing with multiple API VMs
- [deployment-profiles.md](deployment-profiles.md) — `COLCOOR_DEPLOYMENT_PROFILE` / license tiers
- [side-chat-realtime.md](side-chat-realtime.md) — Redis + SSE scaling
