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

1. **Settings** (Cursor or VS Code): search **Colcoor** → **Colcoor: Backend base URL**.
2. Set it to the **public origin** only: scheme + host, optional non-default port, **no path**, **no trailing slash**.  
   Examples: `https://api.example.com`, `https://203.0.113.10` (HTTPS preferred in production).  
   The extension appends **`/api/v1`** itself (e.g. `…/api/v1/auth/cursor`).
3. **Firewall / cloud security group:** allow inbound **80** and/or **443** on the VM from the network where you run Cursor (home IP, office VPN, etc.).
4. **TLS:** use a certificate Node trusts (e.g. Let’s Encrypt). **Self-signed** HTTPS typically causes **fetch / certificate** errors until the system trusts the CA or you terminate TLS with a public cert.
5. **`CORS_ORIGINS`:** the extension issues requests from the **Node extension host**, not a browser tab, so **empty `CORS_ORIGINS` is fine** for extension-only traffic (see [`.env.example`](../.env.example)). Set `CORS_ORIGINS` when **browser** clients must call the API cross-origin.
6. **Auth:** with **`COLCOOR_ENV=production`**, **`POST /api/v1/auth/dev-login` is disabled** (403). Use **Colcoor: Sign in** (`POST /api/v1/auth/cursor` with GitHub / Microsoft / Google tokens); see [authentication.md](authentication.md). For local-only testing, use a **staging** API or **Sign in (dev)** when dev-login is enabled.

---

## Related docs

- [database.md](database.md) — PostgreSQL schema (DDL)
- [architecture.md](architecture.md) — backend role vs extension vs Cursor
- [authentication.md](authentication.md) — Cursor account and JWT intent
- [data-flow-and-api.md](data-flow-and-api.md) — API contracts (append-event, no transcript HTTP)
- [monetization.md](monetization.md) — tokens on every request (product intent)

For local development without the full stack, see the root [README.md](../README.md).
