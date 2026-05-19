# Production deployment — extension backend

This document describes how to run the **Colcoor extension-dedicated API** on a **single Linux VM** using **Docker Compose**, **nginx** as the only public entrypoint, and **PostgreSQL** for persistence.

**Runtime:** the HTTP API is **Python 3.12 + FastAPI + Gunicorn (Uvicorn workers)** in [`packages/backend/`](../packages/backend/). The repo root [`package.json`](../package.json) is for the **VS Code/Cursor extension** only, not the API server.

Product boundaries (no main-thread LLM on the server, no transcript-over-HTTP) are unchanged; see [architecture.md](architecture.md) and [principles.md](principles.md).

---

## Architecture

| Layer | Role | Published to host |
|-------|------|-------------------|
| **nginx** | TLS termination (optional), reverse proxy, rate limiting | **80** (and **443** when enabled) |
| **backend** | FastAPI under `/api/v1`, `/health`, `/ready` | **No** (`expose` only on the Docker network) |
| **pgbouncer** | Connection pooler (transaction mode) | **No** |
| **postgres** | Application data | **No** |
| **redis** | Side-chat SSE pub/sub | **No** |

Traffic flow: **Internet → nginx → backend:8000 → pgbouncer:6432 → postgres:5432**. Alembic migrations use **`DATABASE_MIGRATION_URL`** (direct Postgres) on container start. Side-chat SSE wakeups use **Redis** (`REDIS_URL`); see [side-chat-realtime.md](side-chat-realtime.md). Pool sizing and scaling: [pgbouncer.md](pgbouncer.md).

---

## Repository files

| Path | Purpose |
|------|---------|
| [`docker-compose.prod.yml`](../docker-compose.prod.yml) | Production stack: `nginx`, `backend`, `pgbouncer`, `postgres`, `redis`, healthchecks |
| [`pgbouncer/`](../pgbouncer/) | PgBouncer config, entrypoint, Alpine-based image |
| [`docs/pgbouncer.md`](pgbouncer.md) | Connection scaling, pool env vars, sizing examples |
| [`nginx/nginx.conf`](../nginx/nginx.conf) | Full nginx main config (proxy, rate limits, `/health` + `/ready`) |
| [`packages/backend/Dockerfile`](../packages/backend/Dockerfile) | Multi-stage image, non-root user, Gunicorn |
| [`.env.example`](../.env.example) | Template for root `.env` (secrets must be replaced) |
| [`docker-compose.yml`](../docker-compose.yml) | **Dev-only** Postgres with host port (not for public production) |

---

## Prerequisites

- Linux VM with **Docker** and **Docker Compose** (v2 plugin).
- Firewall allowing inbound **80** / **443** to nginx only.
- Strong secrets (see [Environment variables](#environment-variables)).

---

## First-time deploy

From the **repository root**:

```bash
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, DATABASE_URL (pgbouncer:6432), DATABASE_MIGRATION_URL
# (postgres:5432), JWT_SECRET (long random), GCS_BUCKET, REDIS_URL, optional pool/CORS vars.

docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Verify:

```bash
curl -fsS http://127.0.0.1/health
curl -fsS http://127.0.0.1/ready
curl -fsS http://127.0.0.1/api/v1/health
```

**Logs** (stdout/stderr):

```bash
docker compose -f docker-compose.prod.yml logs -f nginx backend pgbouncer postgres
```

**Rebuild after code or config changes:**

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

**Stop** (keeps the Postgres volume):

```bash
docker compose -f docker-compose.prod.yml down
```

**Stop and remove the database volume** (destructive):

```bash
docker compose -f docker-compose.prod.yml down -v
```

---

## Environment variables

Copy [`.env.example`](../.env.example) to `.env` at the repo root. Compose reads this file; **do not commit `.env`**.

| Variable | Required in production | Notes |
|----------|------------------------|--------|
| `COLCOOR_ENV` | Yes | Must be `production` for strict validation |
| `NODE_ENV` | Set by Compose | `production`; informational for tooling |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Yes | Used by the Postgres container |
| `DATABASE_URL` | Yes | Async SQLAlchemy URL; hostname **`pgbouncer`**, port **6432** ([pgbouncer.md](pgbouncer.md)) |
| `DATABASE_MIGRATION_URL` | Recommended | Direct Postgres for Alembic (`postgresql+psycopg://…@postgres:5432/…`) |
| `DB_POOL_SIZE` | Optional | SQLAlchemy pool size per Gunicorn worker (default **5**) |
| `DB_MAX_OVERFLOW` | Optional | Extra pool connections per worker under burst (default **5**) |
| `DB_POOL_TIMEOUT` | Optional | Seconds to wait for a pooled connection (default **30**) |
| `DB_POOL_RECYCLE` | Optional | Recycle pooled connections after N seconds (default **1800**) |
| `PGBOUNCER_DEFAULT_POOL_SIZE` | Optional | Server connections to Postgres (default **20** in `pgbouncer.ini`) |
| `PGBOUNCER_MAX_CLIENT_CONN` | Optional | Max client connections to PgBouncer (default **200**) |
| `PGBOUNCER_RESERVE_POOL_SIZE` | Optional | Burst server pool (default **5**) |
| `REDIS_URL` | Yes | Side-chat SSE pub/sub; hostname **`redis`** in Compose (`redis://redis:6379/0`) |
| `GCS_BUCKET` | Yes | Conversation images; VM service account needs object access ([image-storage.md](image-storage.md)) |
| `COLCOOR_IMAGE_STORAGE` | Optional | Default `gcs` when bucket set |
| `GCS_SIGNED_URL_TTL_SECONDS` | Optional | Signed GET URL lifetime (default 300, max 3600) |
| `COLCOOR_MAX_IMAGE_BYTES` | Optional | Max image upload size (default 8388608) |
| `JWT_SECRET` | Yes | Min length and placeholder checks at API startup |
| `CORS_ORIGINS` | Optional | Empty = **no** CORS middleware (not allow-all). Comma-separated explicit origins only; `*` is rejected |
| `WEB_CONCURRENCY` | Optional | Gunicorn workers; default **2** (conservative for small VMs) |
| `COLCOOR_LOG_LEVEL` | Optional | `INFO` default; `DEBUG` / `WARNING` / `ERROR` |
| `COLCOOR_LOG_FORMAT` | Optional | `json` (default in production) or `text` |
| `COLCOOR_METRICS_ENABLED` | Optional | Expose `/metrics` (default **true**) |
| `RATE_LIMIT_ENABLED` | Optional | Per-user token-bucket limiting in the API (default **true**). **`/health`** and **`/ready`** are exempt |
| `RATE_LIMIT_RPS_PER_USER` | Optional | Steady refill rate per authenticated user (JWT `sub`; default **10**) |
| `RATE_LIMIT_BURST_PER_USER` | Optional | Burst capacity per user (default **20**) |
| `RATE_LIMIT_RPS_ANON` | Optional | Steady refill for unauthenticated requests keyed by client IP (default **5**) |
| `RATE_LIMIT_BURST_ANON` | Optional | Burst for anonymous/IP buckets (default **10**) |
| `RATE_LIMIT_TRUST_PROXY` | Yes in Compose | **`true`** behind nginx so anonymous limits use the client IP from `X-Forwarded-For`; keep **`false`** if the API is reachable without a trusted proxy |
| `PORT` | Fixed in Compose | Backend listens on **8000** inside the stack; must match nginx upstream |
| `DOMAIN` | Optional | Reserved for future use / docs |
| `CURSOR_AUTH_PROVIDER_ORDER` | Optional | Comma list: `github`, `microsoft`, `google` — order used when `provider_hint` is `auto` on **`POST /api/v1/auth/cursor`** (default `github,microsoft,google`) |
| `CURSOR_AUTH_HTTP_TIMEOUT_SECONDS` | Optional | Timeout for upstream IdP HTTP calls (default **12**, min **2**, max **60**) |
| `COLCOOR_EVENT_PURGE_SCHEDULER_ENABLED` | Optional | When **`true`**, the backend runs a background task (per process) that **hard-deletes** main-thread **`events`** whose **`deleted_at`** is older than the retention window. Compose defaults this to **`true`** for production; use **`false`** if you run a separate purge job. Multiple Gunicorn workers coordinate with a **Postgres advisory lock** so only one worker purges at a time |
| `COLCOOR_EVENT_SOFT_DELETE_RETENTION_HOURS` | Optional | Minimum age of **`deleted_at`** before a row is eligible for hard delete (default **336** = 14 days, max **8760**) |
| `COLCOOR_EVENT_DELETE_UNDO_WINDOW_MINUTES` | Optional | Only **`deleted_by_user_id`** may call undo within this many minutes after delete (default **5**) |
| `COLCOOR_EVENT_PURGE_INTERVAL_SECONDS` | Optional | Sleep between purge runs (default **86400**; min **3600**) |
| `COLCOOR_EVENT_PURGE_INITIAL_DELAY_SECONDS` | Optional | Delay before the first purge after startup (default **300**; avoids immediate load on boot / tests) |

Startup **fails fast** in `COLCOOR_ENV=production` if `JWT_SECRET`, `DATABASE_URL`, or `REDIS_URL` is missing, too short, or matches obvious placeholder patterns (see `colcoor_backend.core.validation`).

---

## Health: liveness vs readiness

| Endpoint | Via nginx | Purpose |
|----------|-----------|---------|
| **`GET /health`** | Yes (unthrottled) | **Liveness** — process is up; no DB check |
| **`GET /ready`** | Yes (unthrottled) | **Readiness** — Postgres, Redis, and image storage (GCS or local) |
| **`GET /metrics`** | Internal only (scrape from Docker network) | Prometheus metrics ([monitoring.md](monitoring.md)) |

- **Docker Compose** marks the backend **healthy** using **`/ready`** so dependent services (nginx) start only after the database is reachable.
- **nginx** edge healthcheck uses **`/health`** (shallow).

**Limitations:** `/ready` does not verify migrations, disk space, or application-level invariants—only configured dependencies (DB, Redis, storage).

**Monitoring:** optional Prometheus + Grafana via `docker compose -f docker-compose.prod.yml --profile monitoring up -d`. See [monitoring.md](monitoring.md).

---

## Rate limiting (API)

The backend applies **per-user** limits using the JWT **`sub`** claim when `Authorization: Bearer` is present. Traffic without a valid token is limited **per client IP** (shared corporate NAT shares one bucket). **`GET /health`** and **`GET /ready`** are never limited.

| Variable | Default | Role |
|----------|---------|------|
| `RATE_LIMIT_ENABLED` | `true` | Turn API rate limiting on or off |
| `RATE_LIMIT_RPS_PER_USER` | `10` | Tokens/sec refill per authenticated user |
| `RATE_LIMIT_BURST_PER_USER` | `20` | Max burst per user |
| `RATE_LIMIT_RPS_ANON` | `5` | Tokens/sec refill per IP (no/invalid Bearer) |
| `RATE_LIMIT_BURST_ANON` | `10` | Max burst per IP |

Exceeded limits return **HTTP 429** with `{"detail":"Rate limit exceeded. Try again shortly."}`.

**Proxy header:** set `RATE_LIMIT_TRUST_PROXY=true` in production Compose so anonymous buckets use the client IP nginx sends in `X-Forwarded-For`. With the flag off (default), only `request.client.host` is used so clients cannot spoof IPs when hitting the API directly.

**Memory:** in-memory buckets for idle keys are dropped after **1 hour** without traffic (per worker).

**Multi-replica:** limits are **in-memory per process** today. Each Gunicorn worker maintains its own buckets; nginx edge limits still apply per IP. For strict global limits across replicas, plan a shared backend (e.g. Redis) behind the same `RateLimitBackend` interface.

---

## nginx

- **Edge rate limiting:** `location /` uses `limit_req` (~**10 req/s** per client IP, **burst=20**). Complements API per-user limits; **`/health`** and **`/ready`** are separate `location =` blocks and are **not** rate-limited at nginx.
- **TLS:** commented `server { listen 443 ssl ... }` block and Compose volume hints live in [`nginx/nginx.conf`](../nginx/nginx.conf). After obtaining certificates (e.g. Certbot on the host), mount them read-only, uncomment **443** in Compose, and align `server_name`.

---

## PostgreSQL and PgBouncer (Compose)

- **Postgres** and **PgBouncer** are **not** exposed on the host in `docker-compose.prod.yml`.
- Data persists in the named volume **`colcoor_postgres_data`**.
- **Light tuning** on Postgres (`max_connections=50` by default) assumes **PgBouncer** multiplexes app traffic; see [pgbouncer.md](pgbouncer.md) for `max_connections`, pool size, and `WEB_CONCURRENCY` guidance.
- The API connects only through **PgBouncer** (`DATABASE_URL`). **Migrations** use **`DATABASE_MIGRATION_URL`** (direct `postgres:5432`) so DDL is not affected by transaction pooling.
- **SQLAlchemy + asyncpg:** prepared-statement caches are disabled in code when using `+asyncpg` (required for PgBouncer transaction mode).

---

## Backups and upgrades

- **Backups:** daily logical dumps via [`scripts/backup-postgres.sh`](../scripts/backup-postgres.sh); GCS image bytes separately. Full runbook: [backup-and-restore.md](backup-and-restore.md).
- **Upgrades:** pull new images or rebuild `backend`, run `docker compose -f docker-compose.prod.yml up -d --build`, watch logs and `/ready`.

---

## Security checklist (short)

- [ ] Replace every placeholder in `.env` with strong random values.
- [ ] Restrict firewall to nginx ports only; do not publish Postgres or the API port.
- [ ] Enable **HTTPS** when exposing the API beyond lab use.
- [ ] Set **`CORS_ORIGINS`** if browser clients call the API from web origins.
- [ ] Rotate **`JWT_SECRET`** and DB credentials on compromise; plan key rotation without downtime where possible.

---

## Cursor / VS Code extension (remote API)

When the API runs on a **remote VM** (this Compose stack), configure the extension to call that host—not `127.0.0.1`.

### Required URL behavior

- The extension has **no fallback default backend URL**.
- Startup requires either:
  - `colcoor.backendBaseUrl` (recommended), or
  - `COLCOOR_API_URL` in the extension host environment.
- If neither is set, the extension shows a clear error and asks the user/admin to define one.

### URL format rules

Set the backend URL to the **public origin only**: scheme + host, optional non-default port, **no path**, **no trailing slash**.

Examples: `https://api.example.com`, `https://203.0.113.10` (HTTPS preferred in production).

The extension appends **`/api/v1`** itself (e.g. `…/api/v1/auth/cursor`).

### Enterprise rollout options

#### Option A (recommended): managed editor settings

Use organization-managed Cursor/VS Code settings to set:

- `colcoor.backendBaseUrl`: `https://api.company.example`

This is the lowest-friction rollout because users do not need to touch local settings.

#### Option B: environment variable

Set this environment variable where Cursor/VS Code is launched:

- `COLCOOR_API_URL=https://api.company.example`

Use this when you already manage desktop/session environment variables.

After changing **`colcoor.backendBaseUrl`** or **`COLCOOR_API_URL`**, have users run **Developer: Reload Window** (Command Palette) so the extension host reloads with the new origin.

### Operational checks

1. **Firewall / cloud security group:** allow inbound **80** and/or **443** on the VM from the network where you run Cursor (home IP, office VPN, etc.).
2. **TLS:** use a certificate Node trusts (e.g. Let’s Encrypt). **Self-signed** HTTPS typically causes **fetch / certificate** errors until the system trusts the CA or you terminate TLS with a public cert.
3. **`CORS_ORIGINS`:** the extension issues requests from the **Node extension host**, not a browser tab, so **empty `CORS_ORIGINS` is fine** for extension-only traffic (see [`.env.example`](../.env.example)). Set `CORS_ORIGINS` when **browser** clients must call the API cross-origin.
4. **Auth:** production clients **MUST** use **`POST /api/v1/auth/cursor`** only ([authentication.md](authentication.md), [api-contracts.md](api-contracts.md) §2.1).

---

## Release artifacts (VSIX + Docker image)

### Extension build (bundle)

The extension package ([`packages/extension`](../packages/extension/)) uses **`npm run build`**: **TypeScript `--noEmit` check**, then **esbuild** bundles the activation entry plus runtime dependencies (**markdown**, **sanitize-html**, **temml**, etc.) into a single **`dist/extension.js`**. Packaging uses **`vsce package --no-dependencies`** because dependencies are **embedded** in that bundle — this avoids workspace hoisting issues and keeps **`npm run package:extension`** reliable in the monorepo.

---

From the **repository root**, one command builds:

- the **extension** `.vsix` (version from [`packages/extension/package.json`](../packages/extension/package.json)), and
- the **backend** image tagged `colcoor-backend:<version>` and `colcoor-backend:prod` (version from [`packages/backend/pyproject.toml`](../packages/backend/pyproject.toml) `[project].version`).

```bash
npm run ship:artifacts
```

Outputs:

| Artifact | Location / name |
|----------|------------------|
| VSIX | `dist/colcoor-enterprise-BE<backend-version>-EXT<extension-version>/colcoor-extension-<extension-version>.vsix` (from `npm run package:extension` at repo root) |
| Docker | `colcoor-backend:<backend-version>` and `colcoor-backend:prod` |

To **push** the same tags to a registry after `docker login`:

```bash
DOCKER_REGISTRY=ghcr.io/yourorg npm run ship:artifacts -- --push
```

Customers can point `docker-compose.prod.yml` at your registry by changing the `backend.image` line (or overriding with Compose `image:` + pull policy in your own overlay).

### Enterprise bundle (image tarball + VSIX + operator scripts)

For **air-gapped or registry-free** handoffs, build a bundle folder and ship the **`.tar.gz`** archive (see below — avoid zip for script permissions):

```bash
npm run bundle:enterprise
```

The bundle and ship scripts source **`scripts/docker-enable-buildkit-if-ok.sh`**: if **`docker buildx`** works, **`DOCKER_BUILDKIT=1`** is set; otherwise **`DOCKER_BUILDKIT=0`** so the **classic builder** runs (avoids “BuildKit is enabled but the buildx component is missing” on minimal installs). The backend Dockerfile sets **`DEBIAN_FRONTEND=noninteractive`** during `apt-get` to avoid debconf “TERM is not set” noise.

If **`tsc` is missing** (fresh clone, no `node_modules`), the bundle step runs **`npm ci`** at the repo root automatically before packaging the VSIX (requires **Node 20+** and npm registry access).

If the build host has **Docker but no Node / no network for npm**, build **backend + compose only** and add the VSIX from your dev machine later:

```bash
npm run bundle:enterprise:skip-vsix
# equivalent:
npm run bundle:enterprise -- --skip-vsix
```

That omits the VSIX and drops **`EXTENSION_VSIX_NOT_INCLUDED.txt`** in the bundle explaining what to copy. Alternatively, point at an existing VSIX: **`npm run bundle:enterprise -- --vsix-path=/abs/path/colcoor-extension-0.0.1.vsix`**.

This writes **`dist/colcoor-enterprise-BE<py-version>-EXT<ext-version>/`** containing:

- `colcoor-backend-<version>.tar.gz` — `docker save` of **`colcoor-backend:<version>`** and **`colcoor-backend:prod`**
- `colcoor-pgbouncer-1.23.1.tar.gz` — pre-built **`colcoor-pgbouncer:1.23.1`** (Alpine PgBouncer + `psql` for healthchecks)
- `pgbouncer/` — config mounted by Compose
- `colcoor-extension-<version>.vsix`
- `docker-compose.yml` (pre-loaded image only, **no build context**)
- `nginx/nginx.conf`
- `scripts/` — load image, generate `.env` / secrets, stack up/down/restart, health check, Postgres backup, **JWT_SECRET rotation**
- `README.customer.txt` — operator order of operations

Customer VM (typical): `00-load-image` → `01-setup-env` → `02-stack-up` → `05-health-check` (paths relative to the bundle directory; see that README).

### Self-host release bundle (first external install)

For **free-tier self-host** (local images, 3-user license, nginx on port 80), build the same `dist/colcoor-enterprise-BE<backend>-EXT<extension>/` layout with self-host compose, `install-colcoor.sh`, and operator docs:

```bash
npm run bundle:release
# equivalent:
npm run bundle:self-host-release
```

Runs extension typecheck + tests, backend tests, Docker image build/save, VSIX package, checksums, a **`.tar.gz` distribution archive** (preserves script `+x`), and **`npm run validate:release`**. Flags (via the underlying script):

```bash
bash scripts/build-self-host-bundle.sh --skip-tests
bash scripts/build-self-host-bundle.sh --skip-docker --skip-vsix
```

Regenerate checksums only after copying files into an existing bundle:

```bash
npm run checksums:release -- dist/colcoor-enterprise-BE0.1.0-EXT0.0.1
```

| Command | Output |
|---------|--------|
| `bundle:release` | `dist/colcoor-enterprise-BE…-EXT…/` plus **`dist/colcoor-enterprise-BE…-EXT….tar.gz`** (ship this on Linux) and **`.tar.gz.sha256`** |
| `validate:release` | Fails if bundle scripts are not executable or if extracting the `.tar.gz` drops `+x` |
| `bundle:enterprise` | Same folder + `.tar.gz`; **GCS-oriented** compose (see enterprise section above) |
| `compose:self-host` | Dev stack from repo source (`docker-compose.self-host.yml`), not the offline bundle |

**Zip vs tar.gz:** For self-host handoffs, use the **`.tar.gz`** produced by the build. A **zip** of the bundle folder often strips executable bits on `scripts/*.sh` (`Permission denied` on Ubuntu). If users must use zip, document `bash scripts/ensure-executable.sh` after extract.

Install and smoke-test: [release-quickstart.md](release-quickstart.md), [release-smoke-test.md](release-smoke-test.md), [release-versions.md](release-versions.md).

---

## Related docs

- [monitoring.md](monitoring.md) — metrics, logs, Grafana, alerts
- [pgbouncer.md](pgbouncer.md) — connection pooling, sizing, env vars
- [database.md](database.md) — PostgreSQL schema (DDL)
- [architecture.md](architecture.md) — backend role vs extension vs Cursor
- [authentication.md](authentication.md) — Cursor account and JWT intent
- [data-flow-and-api.md](data-flow-and-api.md) — API contracts (append-event, no transcript HTTP)
- [monetization.md](monetization.md) — tokens on every request (product intent)

For local development without the full stack, see the root [README.md](../README.md).
