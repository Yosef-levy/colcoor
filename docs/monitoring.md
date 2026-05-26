# Monitoring and observability

Colcoor ships **lightweight** production visibility: Prometheus metrics, JSON structured logs, request IDs, and improved readiness checks. There is no OpenTelemetry, distributed tracing, or hosted APM in this stack.

Works the same for **Docker Compose on a VM** (hosted or self-hosted).

---

## What you get

| Feature | Endpoint / output | Notes |
|---------|-------------------|--------|
| **Liveness** | `GET /health` | Process up only |
| **Readiness** | `GET /ready` | DB, Redis, image storage (GCS or local) |
| **Metrics** | `GET /metrics` | Prometheus text format (`prometheus_client`) |
| **Request ID** | Header `X-Request-ID` | Generated or propagated; in logs and responses |
| **Access logs** | stdout JSON (production) | `request_id`, `route`, `latency_ms`, optional `user_id` |
| **Optional stack** | Prometheus + Grafana | Compose profile `monitoring` |

---

## Enable monitoring stack (Compose)

From the repo root, with an existing `.env`:

```bash
docker compose -f docker-compose.prod.yml --profile monitoring up -d
```

| Service | URL (default) | Purpose |
|---------|---------------|---------|
| Prometheus | http://localhost:9090 | Scrapes `backend:8000/metrics` every 15s |
| Grafana | http://localhost:3000 | Pre-provisioned datasource + **Colcoor overview** dashboard |

Default Grafana login: `admin` / `admin` (override with `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` in `.env`).

**Security:** bind Prometheus and Grafana to localhost or protect them with firewall/VPN. Do not expose `:9090` / `:3000` on the public internet without authentication.

Self-hosted operators can skip the profile and scrape `/metrics` with any Prometheus-compatible collector.

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `COLCOOR_METRICS_ENABLED` | `true` | Expose `/metrics` |
| `COLCOOR_LOG_FORMAT` | empty | `json` or `text`. Empty → **json** when `COLCOOR_ENV=production` |
| `COLCOOR_LOG_LEVEL` | `INFO` | Log level |
| `GRAFANA_ADMIN_USER` | `admin` | Grafana (monitoring profile only) |
| `GRAFANA_ADMIN_PASSWORD` | `admin` | Change in production |
| `GRAFANA_ROOT_URL` | `http://localhost:3000` | Grafana external URL |

---

## Prometheus metrics

| Metric | Type | Labels | Meaning |
|--------|------|--------|---------|
| `colcoor_http_requests_total` | Counter | `method`, `route`, `status` | Request count (route = FastAPI template path) |
| `colcoor_http_errors_total` | Counter | `method`, `route`, `status` | Responses with status ≥ 400 |
| `colcoor_http_request_duration_seconds` | Histogram | `method`, `route` | Latency |
| `colcoor_sse_connections_active` | Gauge | — | Open side-chat SSE streams **per worker** |
| `colcoor_sse_stream_opens_total` | Counter | `reconnect` | SSE stream opens (`true` when `X-Colcoor-SSE-Attempt` > 0) |
| `colcoor_sse_reconnects_total` | Counter | — | Client reconnect opens (extension sends attempt > 0) |
| `colcoor_sse_stream_disconnects_total` | Counter | `reason` | SSE streams closed (`closed` on normal generator exit) |
| `colcoor_redis_publish_total` | Counter | `result` | Side-chat Redis publishes (`ok` / `error`) |
| `colcoor_redis_listener_reconnects_total` | Counter | — | Side-chat Redis pub/sub listener reconnect cycles |
| `colcoor_redis_listener_errors_total` | Counter | — | Listener exceptions before reconnect |
| `colcoor_redis_subscribed_channels` | Gauge | — | Redis channels subscribed on this worker |
| `colcoor_redis_sse_waiters` | Gauge | — | Local SSE waiters multiplexed onto Redis |
| `colcoor_append_event_idempotency_total` | Counter | `result` | Append-event dedup (`created` / `replayed`) |
| `colcoor_rate_limit_rejected_total` | Counter | `key_type` | Rate-limited requests (`user` / `ip`) |
| `colcoor_deployment_info` | Info | — | Static labels: `instance_id`, `node_role` (from env) |
| `colcoor_db_pool_checked_out` | Gauge | — | SQLAlchemy connections in use |
| `colcoor_db_pool_size` | Gauge | — | Configured pool size |
| `colcoor_db_pool_overflow` | Gauge | — | Overflow connections |
| `colcoor_db_pool_checked_in` | Gauge | — | Idle pooled connections |

`/health`, `/ready`, and `/metrics` are excluded from HTTP latency histograms to avoid skew.

**Multi-worker:** Gunicorn runs multiple processes; each exposes its own `/metrics`. Prometheus scrapes one target per backend container — sum gauges across workers mentally, or add `honor_labels` / per-pod discovery later.

**Multi-VM:** [`monitoring/prometheus.yml`](../monitoring/prometheus.yml) lists a single `backend:8000` target (one Compose stack). For several API VMs, use [`monitoring/prometheus-multi-vm.example.yml`](../monitoring/prometheus-multi-vm.example.yml) — one scrape target per VM/nginx — and set **`COLCOOR_INSTANCE_ID`** / **`COLCOOR_NODE_ROLE`** on each backend so `colcoor_deployment_info` and JSON logs align — [multi-vm-deploy.md](multi-vm-deploy.md).

Sample config: [`monitoring/prometheus.yml`](../monitoring/prometheus.yml).

---

## Structured logs

Production (`COLCOOR_ENV=production`) emits **one JSON object per line**:

```json
{
  "timestamp": "2026-05-18T12:00:00.000000+00:00",
  "level": "INFO",
  "logger": "colcoor.access",
  "message": "request completed",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "route": "/api/v1/conversations/{conversation_id}/side-chat/stream",
  "method": "GET",
  "status": 200,
  "latency_ms": 42.5,
  "user_id": "…",
  "instance_id": "colcoor-api-1"
}
```

`instance_id` appears when **`COLCOOR_INSTANCE_ID`** is set (e.g. by `deploy-multi-vm.sh` on each VM).

Errors include an `error` field with stack traces.

**HTTP access logs:** The API emits one structured line per request on **`colcoor.access`** (via `RequestContextMiddleware`). Gunicorn **`--access-logfile` is not enabled** in `colcoor-start.sh` (avoids duplicate CLF lines). Uvicorn access logging is disabled; use `colcoor.access` for request tracing. **`COLCOOR_LOG_FORMAT`** is resolved through app settings (`json` in production when unset).

**Log level:** Keep **`COLCOOR_LOG_LEVEL=INFO`** (default) if you need HTTP access lines. Values above `INFO` (e.g. `WARNING`) suppress successful `colcoor.access` entries.

**nginx:** The reverse proxy may still write its own `access.log` at the edge; that is separate from backend stdout JSON.

---

## Readiness

`GET /ready` returns **503** if any required dependency fails:

```json
{
  "status": "ready",
  "database": "ok",
  "redis": "ok",
  "storage": "ok"
}
```

- **database** — `SELECT 1` via `DATABASE_URL`
- **redis** — `PING` when `REDIS_URL` is set (required in production)
- **storage** — GCS bucket exists, or local image directory is writable

---

## Most important metrics (start here)

1. **`rate(colcoor_http_requests_total{status=~"5.."}[5m])`** — server errors
2. **`histogram_quantile(0.95, rate(colcoor_http_request_duration_seconds_bucket[5m]))`** — tail latency
3. **`colcoor_db_pool_checked_out` / `colcoor_db_pool_size`** — connection pool pressure (with PgBouncer, also watch PgBouncer server pool)
4. **`colcoor_sse_connections_active`** — long-lived streams (memory / file descriptors)
5. **`rate(colcoor_redis_publish_total{result="error"}[5m])`** — side-chat wake failures
6. **`rate(colcoor_redis_listener_errors_total[5m])`** — Redis pub/sub listener instability
7. **`rate(colcoor_append_event_idempotency_total{result="replayed"}[5m])`** — client retries successfully deduped
8. **`rate(colcoor_rate_limit_rejected_total[5m])`** — API rate limit pressure

---

## Suggested first alerts

| Alert | Condition | Likely cause |
|-------|-----------|--------------|
| **API down** | `up{job="colcoor-backend"} == 0` | Container crash, deploy failure |
| **Not ready** | `/ready` failing (blackbox or k8s probe) | Postgres, Redis, or GCS misconfigured |
| **High 5xx rate** | 5xx rate > 1% for 5m | App bug, DB timeouts |
| **High p95 latency** | p95 > 2s for 10m | DB slow, pool exhaustion, cold GCS |
| **Pool saturated** | `checked_out` ≈ `pool_size` + overflow sustained | Too many workers or small pool; tune PgBouncer |
| **Redis publish errors** | `redis_publish_total{result="error"}` increasing | Redis down or network partition |

---

## Expected overhead

| Component | Rough cost |
|-----------|------------|
| **prometheus_client** | In-process counters/histograms; negligible CPU per request |
| **JSON logging** | Small serialization cost; prefer log shipping over debug-level volume |
| **Request middleware** | One UUID + timer per request (except `/health`, `/ready`, `/metrics`) |
| **Prometheus** | ~50–100 MB RAM for small scrape; disk grows with retention |
| **Grafana** | ~100–200 MB RAM |

No extra network hops per API request unless you run the monitoring profile.

---

## Files

| Path | Purpose |
|------|---------|
| [`monitoring/prometheus.yml`](../monitoring/prometheus.yml) | Scrape config |
| [`monitoring/grafana/dashboards/colcoor-overview.json`](../monitoring/grafana/dashboards/colcoor-overview.json) | Starter dashboard |
| [`packages/backend/colcoor_backend/observability/`](../packages/backend/colcoor_backend/observability/) | Metrics + middleware |

See also [production.md](production.md) and [pgbouncer.md](pgbouncer.md) for deployment context.
