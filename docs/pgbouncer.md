# PgBouncer and database connection scaling

Colcoor production Compose places **PgBouncer** between the API and PostgreSQL so many Gunicorn workers and horizontal replicas do not open one server connection each.

## Why PgBouncer

Each **Uvicorn worker** is a process with its own SQLAlchemy connection pool (`DB_POOL_SIZE` + `DB_MAX_OVERFLOW` connections). With **WEB_CONCURRENCY=2** and **2 API replicas**, raw Postgres could need dozens of connections before counting admin or migrations.

PostgreSQL **`max_connections`** is a hard limit; every connection costs RAM. **PgBouncer** accepts many lightweight **client** connections and multiplexes them onto a small **server** pool talking to Postgres.

```
                    ┌─────────────┐
  Gunicorn workers  │  PgBouncer  │  default_pool_size (e.g. 20)
  (pools per proc)  │ transaction │──────────────────┐
        │           │    mode     │                  ▼
        └──────────►│   :6432     │            ┌───────────┐
                    └─────────────┘            │ Postgres  │
                                               │  :5432    │
                                               └───────────┘
```

## Pool mode: transaction

We use **`pool_mode = transaction`**: a server connection is assigned for one transaction, then returned to the pool. This fits FastAPI request/response cycles and SQLAlchemy’s typical session-per-request pattern.

Implications:

- **asyncpg** must disable prepared-statement caches (see `colcoor_backend.db.session`) because the underlying Postgres session may change between transactions.
- **`server_reset_query = DISCARD ALL`** clears session state when a server connection is reused.
- **Alembic migrations** should use **`DATABASE_MIGRATION_URL`** (direct `postgres:5432`) to avoid edge cases with DDL and pooling during deploy.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | — | App URL; hostname **`pgbouncer`**, port **6432** |
| `DATABASE_MIGRATION_URL` | optional | Direct Postgres for `alembic upgrade` (`postgres:5432`, `postgresql+psycopg://…`) |
| `DB_POOL_SIZE` | 5 | SQLAlchemy pool size per worker process |
| `DB_MAX_OVERFLOW` | 5 | Extra connections per worker under burst |
| `DB_POOL_TIMEOUT` | 30 | Seconds to wait for a pool connection |
| `DB_POOL_RECYCLE` | 1800 | Recycle pooled connections after N seconds |
| `PGBOUNCER_MAX_CLIENT_CONN` | 200 | Max client connections to PgBouncer |
| `PGBOUNCER_DEFAULT_POOL_SIZE` | 20 | Server connections per user/database pair |
| `PGBOUNCER_RESERVE_POOL_SIZE` | 5 | Extra server connections under load |

Example `.env` (app via PgBouncer):

```bash
DATABASE_URL=postgresql+asyncpg://colcoor:SECRET@pgbouncer:6432/colcoor
DATABASE_MIGRATION_URL=postgresql+psycopg://colcoor:SECRET@postgres:5432/colcoor
```

## Sizing guidance

### Small VM (1–2 vCPU, 2–4 GiB RAM)

| Setting | Suggested |
|---------|-----------|
| `WEB_CONCURRENCY` | 2 |
| `DB_POOL_SIZE` | 5 |
| `DB_MAX_OVERFLOW` | 5 |
| `PGBOUNCER_DEFAULT_POOL_SIZE` | 15 |
| Postgres `max_connections` | 50 (compose default) |

Rough client demand: `WEB_CONCURRENCY × (DB_POOL_SIZE + DB_MAX_OVERFLOW)` per backend container. Two workers → up to **20** client conns per replica before overflow; PgBouncer holds **15** server conns to Postgres.

### Medium VM (4 vCPU, 8 GiB RAM)

| Setting | Suggested |
|---------|-----------|
| `WEB_CONCURRENCY` | 4 |
| `DB_POOL_SIZE` | 8 |
| `DB_MAX_OVERFLOW` | 8 |
| `PGBOUNCER_DEFAULT_POOL_SIZE` | 25–30 |
| Postgres `max_connections` | 80–100 |

### Rules of thumb

1. **`PGBOUNCER_DEFAULT_POOL_SIZE` < Postgres `max_connections`** — reserve headroom for superuser, monitoring, and `DATABASE_MIGRATION_URL`.
2. **Total server load** ≈ `default_pool_size` + `reserve_pool_size` per database (single DB here).
3. **`WEB_CONCURRENCY`**: I/O-bound API; start with **2 × vCPU**, cap around **8** unless profiling shows benefit.
4. If **`/ready` times out** or you see **“too many clients”** on Postgres, lower per-worker pool sizes or raise PgBouncer `default_pool_size` / Postgres `max_connections` together.

## Health and startup order

Compose starts **postgres** → **pgbouncer** (healthy when port accepts connections and `psql` through pool works) → **backend** ( `/ready` checks DB via `DATABASE_URL` through PgBouncer).

## Self-hosted / no Kubernetes

This setup is **Docker Compose only**: config lives in [`pgbouncer/`](../pgbouncer/) and [`docker-compose.prod.yml`](../docker-compose.prod.yml). The image is **`colcoor-pgbouncer:1.23.1`**, built from **Alpine 3.21** (`apk add pgbouncer postgresql-client`) because the legacy `pgbouncer/pgbouncer` Hub image stops at 1.15.0. No Kubernetes or operator required.

## Security note

`auth_type = plain` in `pgbouncer.ini` is acceptable on the **internal Compose network** only. Do not expose port 6432 on the public host.
