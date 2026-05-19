# Self-host installation (MVP)

Run Colcoor on a laptop or small VM in about five minutes. Uses the **same backend image** as production; the free tier is limited to **3 users** via license config (no phone-home).

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- ~2 GB RAM, ~10 GB disk
- Cursor / VS Code with the Colcoor extension

## Steps

### 1. Configure environment

From the repository root:

```bash
cp .env.example .env
./scripts/generate-self-host-secrets.sh >> .env
```

Edit `.env` if needed. For self-host, ensure:

```bash
COLCOOR_DEPLOYMENT_PROFILE=free
COLCOOR_LICENSE_TYPE=free
COLCOOR_IMAGE_STORAGE=local
```

`generate-self-host-secrets.sh` fills `JWT_SECRET`, `POSTGRES_PASSWORD`, and database URLs.

### 2. Start the stack

```bash
docker compose -f docker-compose.self-host.yml up -d --build
```

Or: `npm run compose:self-host`

Services: `postgres`, `pgbouncer`, `redis`, `backend` (internal :8000), `nginx` (public **port 80** by default).

**Release bundle:** run `./install-colcoor.sh` from the unpacked folder instead of the manual steps above.

### 3. Verify health

```bash
curl -sS http://localhost/health
curl -sS http://localhost/ready
```

`/ready` checks Postgres, Redis, and local image storage.

### 4. Point the Cursor extension

In VS Code / Cursor settings (JSON):

```json
{
  "colcoor.backendBaseUrl": "http://localhost"
}
```

Sign in via the extension (Cursor account token exchange). The instance allows up to **3 distinct users**; a 4th **new** account receives `license_user_limit_reached`. Existing users can still sign in if the limit was lowered later.

### 5. Check license status (authenticated)

```bash
# After obtaining a JWT from POST /api/v1/auth/cursor
curl -sS -H "Authorization: Bearer $TOKEN" http://localhost/api/v1/system/license
```

Returns `license_type`, `deployment_profile`, `max_users`, `current_users`, `license_key_present` (never the raw key).

## Free tier and future paid license

| Setting | Free self-host default |
|---------|-------------------------|
| `COLCOOR_LICENSE_TYPE` | `free` |
| `COLCOOR_LICENSE_MAX_USERS` | `3` (or unset → 3) |
| `COLCOOR_LICENSE_KEY` | empty |

After Lemon Squeezy integration, set `COLCOOR_LICENSE_KEY` and matching `COLCOOR_LICENSE_TYPE` / `COLCOOR_LICENSE_MAX_USERS` from your purchase email. Until then, paid-looking tiers can be tested with env only (offline, no verification).

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| DB connection failed | `DATABASE_URL` uses host `pgbouncer:6432`; passwords match `POSTGRES_PASSWORD`; `docker compose … logs postgres pgbouncer backend` |
| Redis connection failed | `REDIS_URL=redis://redis:6379/0`; `docker compose … ps redis` |
| `/ready` 503 storage | `COLCOOR_IMAGE_STORAGE=local` and volume `colcoor_images` mounted at `/var/lib/colcoor/images` |
| Invalid backend URL in extension | `colcoor.backendBaseUrl` must match nginx URL (`http://<host>` on port 80, or `http://<host>:8080` if you set `SELF_HOST_HTTP_PORT=8080`); test with `curl …/health` |
| Port 80 permission denied | Docker needs permission to bind :80; run install as root/sudo or set `SELF_HOST_HTTP_PORT=8080` in `.env` |
| `license_user_limit_reached` | 3 users already registered; use an existing account or raise `COLCOOR_LICENSE_MAX_USERS` for testing |
| Startup crash on profile | `COLCOOR_DEPLOYMENT_PROFILE` must be `free`, `team`, `business`, `hosted`, or `enterprise` |

## Manual smoke test (Compose)

1. `docker compose -f docker-compose.self-host.yml up -d --build`
2. `curl http://localhost/health` → `{"status":"ok"}`
3. `curl http://localhost/ready` → `"status":"ready"`
4. Extension: set `colcoor.backendBaseUrl`, sign in three different Cursor accounts
5. Fourth new sign-in → HTTP 403, `"code":"license_user_limit_reached"`

## Scaling up later

- **Team / business:** Same image; override env or future `docker-compose.team.yml` / `docker-compose.business.yml`
- **Hosted:** `docker-compose.prod.yml` + GCS + managed Postgres/Redis
- **Kubernetes:** Helm charts (not in MVP)

See [deployment-profiles.md](deployment-profiles.md).
