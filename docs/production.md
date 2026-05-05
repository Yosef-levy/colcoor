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
| **postgres** | Application data | **No** |

Traffic flow: **Internet → nginx → backend:8000 → postgres:5432** (service DNS names on the Compose network).

---

## Repository files

| Path | Purpose |
|------|---------|
| [`docker-compose.prod.yml`](../docker-compose.prod.yml) | Production stack: `nginx`, `backend`, `postgres`, named volume, healthchecks |
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
# Edit .env: set POSTGRES_PASSWORD, DATABASE_URL (must match DB user/password/db),
# JWT_SECRET (long random), optional CORS_ORIGINS, WEB_CONCURRENCY, COLCOOR_LOG_LEVEL.

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
docker compose -f docker-compose.prod.yml logs -f nginx backend postgres
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
| `DATABASE_URL` | Yes | Async SQLAlchemy URL; hostname **`postgres`**, credentials must match Postgres |
| `JWT_SECRET` | Yes | Min length and placeholder checks at API startup |
| `CORS_ORIGINS` | Optional | Empty = **no** CORS middleware (not allow-all). Comma-separated explicit origins only; `*` is rejected |
| `WEB_CONCURRENCY` | Optional | Gunicorn workers; default **2** (conservative for small VMs) |
| `COLCOOR_LOG_LEVEL` | Optional | `INFO` default; `DEBUG` / `WARNING` / `ERROR` |
| `PORT` | Fixed in Compose | Backend listens on **8000** inside the stack; must match nginx upstream |
| `DOMAIN` | Optional | Reserved for future use / docs |
| `CURSOR_AUTH_PROVIDER_ORDER` | Optional | Comma list: `github`, `microsoft`, `google` — order used when `provider_hint` is `auto` on **`POST /api/v1/auth/cursor`** (default `github,microsoft,google`) |
| `CURSOR_AUTH_HTTP_TIMEOUT_SECONDS` | Optional | Timeout for upstream IdP HTTP calls (default **12**, min **2**, max **60**) |
| `COLCOOR_EVENT_PURGE_SCHEDULER_ENABLED` | Optional | When **`true`**, the backend runs a background task (per process) that **hard-deletes** main-thread **`events`** whose **`deleted_at`** is older than the retention window. Compose defaults this to **`true`** for production; use **`false`** if you run a separate purge job. Multiple Gunicorn workers coordinate with a **Postgres advisory lock** so only one worker purges at a time |
| `COLCOOR_EVENT_SOFT_DELETE_RETENTION_HOURS` | Optional | Minimum age of **`deleted_at`** before a row is eligible for hard delete (default **336** = 14 days, max **8760**) |
| `COLCOOR_EVENT_DELETE_UNDO_WINDOW_MINUTES` | Optional | Only **`deleted_by_user_id`** may call undo within this many minutes after delete (default **5**) |
| `COLCOOR_EVENT_PURGE_INTERVAL_SECONDS` | Optional | Sleep between purge runs (default **86400**; min **3600**) |
| `COLCOOR_EVENT_PURGE_INITIAL_DELAY_SECONDS` | Optional | Delay before the first purge after startup (default **300**; avoids immediate load on boot / tests) |

Startup **fails fast** in `COLCOOR_ENV=production` if `JWT_SECRET` or `DATABASE_URL` is missing, too short, or matches obvious placeholder patterns (see `colcoor_backend.core.validation`).

---

## Health: liveness vs readiness

| Endpoint | Via nginx | Purpose |
|----------|-----------|---------|
| **`GET /health`** | Yes (unthrottled) | **Liveness** — process is up; no DB check |
| **`GET /ready`** | Yes (unthrottled) | **Readiness** — `SELECT 1` against Postgres when `DATABASE_URL` is set |

- **Docker Compose** marks the backend **healthy** using **`/ready`** so dependent services (nginx) start only after the database is reachable.
- **nginx** edge healthcheck uses **`/health`** (shallow).

**Limitations:** `/ready` does not verify migrations, disk space, or application-level invariants—only that the API can open a DB connection and run `SELECT 1`.

---

## nginx

- **Rate limiting:** `location /` uses `limit_req` (~**10 req/s** per client IP, **burst=20**). **`/health`** and **`/ready`** are separate `location =` blocks and are **not** rate-limited.
- **TLS:** commented `server { listen 443 ssl ... }` block and Compose volume hints live in [`nginx/nginx.conf`](../nginx/nginx.conf). After obtaining certificates (e.g. Certbot on the host), mount them read-only, uncomment **443** in Compose, and align `server_name`.

---

## PostgreSQL (Compose)

- **Not** exposed on the host in `docker-compose.prod.yml`.
- Data persists in the named volume **`colcoor_postgres_data`**.
- **Light tuning** is applied via `postgres` `command:` flags (shared buffers, `max_connections`, effective cache estimate, WAL/checkpoint settings) suitable for a **small VM**; adjust if you have very little RAM or much more capacity.

---

## Backups and upgrades

- **Backups:** use your preferred approach (`pg_dump` from a one-off container on the same network, or volume snapshots). Document retention and restore drills outside this file.
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

For **air-gapped or registry-free** handoffs, build a single folder you can zip and send to the customer’s VM team:

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
- `colcoor-extension-<version>.vsix`
- `docker-compose.yml` (pre-loaded image only, **no build context**)
- `nginx/nginx.conf`
- `scripts/` — load image, generate `.env` / secrets, stack up/down/restart, health check, Postgres backup, **JWT_SECRET rotation**
- `README.customer.txt` — operator order of operations

Customer VM (typical): `00-load-image` → `01-setup-env` → `02-stack-up` → `05-health-check` (paths relative to the bundle directory; see that README).

---

## Related docs

- [database.md](database.md) — PostgreSQL schema (DDL)
- [architecture.md](architecture.md) — backend role vs extension vs Cursor
- [authentication.md](authentication.md) — Cursor account and JWT intent
- [data-flow-and-api.md](data-flow-and-api.md) — API contracts (append-event, no transcript HTTP)
- [monetization.md](monetization.md) — tokens on every request (product intent)

For local development without the full stack, see the root [README.md](../README.md).
