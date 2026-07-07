# Side-chat realtime (SSE + Redis)

Side-chat uses **Server-Sent Events** (`GET /api/v1/conversations/{id}/side-chat/stream`) for live updates. The HTTP contract is unchanged for clients; only the backend wakeup transport changed from Postgres `LISTEN`/`NOTIFY` to **Redis pub/sub**.

## Architecture

| Piece | Role |
|-------|------|
| **REST mutations** | `POST` / `PATCH` / `DELETE` on side-chat messages commit to Postgres, then `PUBLISH` on `colcoor:side_chat:{conversation_id}`. |
| **SSE stream** | Polls `side_chat_messages` where `seq > after_seq`; when idle, waits on a local `asyncio.Event` fed by Redis. |
| **Per-worker multiplexing** | Many SSE clients on the same conversation share **one** Redis `SUBSCRIBE` per API process. |
| **Payload** | `{"s": <seq>}` — hint only; message bodies always come from Postgres. |

Postgres no longer runs a `pg_notify` trigger (migration `010_drop_side_chat_pg_notify`). Wakeups are explicit from application code after commit.

## Environment variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `REDIS_URL` / `COLCOOR_REDIS_URL` | **Yes** in `COLCOOR_ENV=production` | unset | Async Redis client URL (`redis://` or `rediss://`). |
| `COLCOOR_SIDE_CHAT_SSE_POLL_SEC` | No | `0.12` | Max idle wait (Redis timeout or poll-only sleep). |
| `COLCOOR_SIDE_CHAT_SSE_DISABLE_NOTIFY` | No | unset | If `1`, force poll-only (no Redis subscribe). |
| `COLCOOR_SIDE_CHAT_SSE_MAX_SECONDS` | No | `0` | End stream after N seconds (tests only). |

Also requires `DATABASE_URL` and `JWT_SECRET` as for the rest of the API.

## Local development

1. Start dependencies:

   ```bash
   docker compose up -d
   ```

   This starts **Postgres** and **Redis** (port `6379`).

2. Run the API with migrations applied and optional Redis:

   ```bash
   export DATABASE_URL=postgresql+asyncpg://colcoor:colcoor@127.0.0.1:5432/colcoor
   export REDIS_URL=redis://127.0.0.1:6379/0   # optional
   alembic upgrade head
   uvicorn colcoor_backend.app:create_app --factory --reload
   ```

3. **Without `REDIS_URL`**: SSE still works via short polling (~120ms idle). Fine for solo dev; not for multi-replica or latency-sensitive tests.

4. **With `REDIS_URL`**: Matches production wakeup behavior on a single machine.

## Production

- Set `REDIS_URL=redis://redis:6379/0` (or managed Redis/TLS `rediss://…`) in `.env`.
- `docker-compose.prod.yml` includes a `redis` service; backend `depends_on` redis health.
- `/ready` returns `"redis": "ok"` when configured; startup fails in production if `REDIS_URL` is missing.
- Use a dedicated Redis instance or DB index; channel prefix is `colcoor:side_chat:`.
- Redis is used **only for pub/sub** (no persistence required for wakeups). The prod compose image disables RDB/AOF for a minimal footprint; use managed Redis settings for HA.

### Scaling

- **Horizontal API replicas**: Any replica can `PUBLISH` after a write; all replicas with SSE clients subscribed to that conversation receive the wakeup.
- **Load balancer**: Sticky sessions are **not** required for correctness (each stream polls Postgres), but long-lived SSE connections should use LB timeouts ≥ client reconnect interval (extension uses exponential backoff).
- **Nginx**: `proxy_read_timeout` should exceed typical SSE duration; backend sets `X-Accel-Buffering: no`.

## Migration from Postgres NOTIFY

1. Deploy API that **publishes to Redis** and **subscribes in SSE** (this change) while the old `pg_notify` trigger may still exist — double wakeups are harmless.
2. Run migration `010_drop_side_chat_pg_notify` to remove the trigger and free NOTIFY load on Postgres.
3. Remove per-connection `LISTEN` from API workers (already removed in SSE code).
4. Set `REDIS_URL` in production and verify `/ready` reports `"redis": "ok"`.

Rollback: re-run downgrade on `010` to restore the trigger; redeploy an API build that still uses Redis or temporarily set `COLCOOR_SIDE_CHAT_SSE_DISABLE_NOTIFY=1` for poll-only SSE.

## Remaining bottlenecks

- **One open SSE per connected user** — still long-lived HTTP; LB and worker connection limits apply.
- **Postgres read per wakeup** — each notify causes at least one `SELECT` for new rows (unchanged; NOTIFY was never carrying bodies).
- **Burst traffic** — many messages/sec still mean many DB round-trips; consider batching reads if that becomes hot.
- **Redis single channel per conversation** — very large rooms with thousands of simultaneous SSE viewers still multiply DB polls (one poll per stream per wakeup), not Redis fan-out cost on the server side (multiplexed subscribe per worker).
