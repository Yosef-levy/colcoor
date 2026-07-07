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

Production (`COLCOOR_ENV=production`) emits **one flat JSON object per line** (Loki/ELK-friendly; no nested payloads).

### Core fields (every JSON line)

| Field | Description |
|-------|-------------|
| `timestamp` | ISO-8601 UTC |
| `level` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `service` | Always `colcoor-api` |
| `env` | `COLCOOR_ENV` (e.g. `production`, `development`) |
| `logger` | Python logger name (e.g. `colcoor.access`) |
| `message` | Human-readable summary (redacted) |

### Correlation & HTTP (when applicable)

| Field | Description |
|-------|-------------|
| `event_type` | Stable taxonomy — see below |
| `request_id` | `X-Request-ID` |
| `instance_id` | When **`COLCOOR_INSTANCE_ID`** is set |
| `method`, `route`, `status`, `latency_ms` | HTTP access (`event_type=http_request`) |
| `user_id` | Authenticated user UUID |
| `error_code` | API error code (domain events) |
| `conversation_id` | When logged by domain code (e.g. SSE open/close) |
| `sse_attempt`, `sse_session`, `reconnect` | Side-chat SSE open and close |
| `after_seq` | SSE cursor at connect (`after_seq` query param) |
| `stream_duration_ms` | Wall time for full SSE connection (`sse_stream_close` only) |
| `last_seq` | Last seq cursor when stream ended |
| `sse_disconnect_reason` | `client_cancelled`, `timeout`, `error`, `completed` |
| `error` | Redacted stack trace when `exc_info` is set (errors only, not client disconnect) |

Example HTTP access line:

```json
{
  "timestamp": "2026-05-18T12:00:00.000000+00:00",
  "level": "INFO",
  "service": "colcoor-api",
  "env": "production",
  "logger": "colcoor.access",
  "message": "request completed",
  "event_type": "http_request",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "instance_id": "colcoor-api-1",
  "method": "GET",
  "route": "/api/v1/conversations/{conversation_id}/side-chat/stream",
  "status": 200,
  "latency_ms": 42.5,
  "user_id": "…"
}
```

`latency_ms` on SSE routes reflects **response start** (stream opened), not full connection duration. Use **`stream_duration_ms`** on `sse_stream_close` for real stream lifetime.

### Side-chat SSE lifecycle

Each SSE connection emits **two** structured domain lines (no per-message logs):

| `event_type` | When |
|--------------|------|
| `sse_stream_open` | Route returns `StreamingResponse` (before generator runs) |
| `sse_stream_close` | Generator `finally` (client disconnect, timeout, or error) |

Correlate open and close with `request_id`, `conversation_id`, and `sse_session`.

| `sse_disconnect_reason` | Meaning |
|-------------------------|---------|
| `client_cancelled` | Client closed connection (`CancelledError`); INFO only |
| `timeout` | `COLCOOR_SIDE_CHAT_SSE_MAX_SECONDS` exceeded (tests) |
| `error` | Exception in stream loop; includes redacted `error` field |
| `completed` | Loop exited without cancel/timeout/error (reserved) |

Prometheus: `colcoor_sse_stream_disconnects_total{reason=...}` uses the same reason labels.

```logql
{service="colcoor-api"} | json | event_type="sse_stream_close"
{service="colcoor-api"} | json | event_type="sse_stream_close" | sse_disconnect_reason="client_cancelled"
{service="colcoor-api"} | json | request_id="..." | event_type=~"sse_stream_.*"
```

### Event taxonomy (`event_type`)

| `event_type` | Source |
|--------------|--------|
| `http_request` | `colcoor.access` middleware (every HTTP request) |
| `license_user_limit_reached` | License handler |
| `http_exception` | HTTP error handler |
| `validation_error` | Validation handler |
| `infrastructure_error` | Classified infra errors |
| `unhandled_exception` | Unhandled 500 handler |
| `sse_stream_open` | Side-chat SSE route |
| `sse_stream_close` | Side-chat SSE generator end |

Unstructured startup/readiness logs may omit `event_type`. Unknown types passed to `log_event()` are allowed but log **one warning per process** per unknown name.

### Loki query examples

```logql
{service="colcoor-api", env="production"} | json | event_type="http_request"
{service="colcoor-api"} | json | event_type="sse_stream_open"
{service="colcoor-api"} | json | event_type="sse_stream_close"
{service="colcoor-api"} | json | request_id="550e8400-e29b-41d4-a716-446655440000"
{service="colcoor-api"} | json | level="ERROR"
```

### Cardinality (logs vs metrics)

- **Logs:** `user_id`, `conversation_id`, and `request_id` are fine for filtering and incident triage.
- **Prometheus:** Keep using route **templates** and low-cardinality labels — do **not** add `user_id` or `conversation_id` as metric labels.

**HTTP access logs:** The API emits one structured line per request on **`colcoor.access`** (via `RequestContextMiddleware`). Gunicorn **`--access-logfile` is not enabled** in `colcoor-start.sh` (avoids duplicate CLF lines). Uvicorn access logging is disabled; use `colcoor.access` for request tracing. **`COLCOOR_LOG_FORMAT`** is resolved through app settings (`json` in production when unset).

**Log level:** Keep **`COLCOOR_LOG_LEVEL=INFO`** (default) if you need HTTP access lines. Values above `INFO` (e.g. `WARNING`) suppress successful `colcoor.access` entries.

**nginx:** The reverse proxy may still write its own `access.log` at the edge; that is separate from backend stdout JSON.

### Log redaction (safety net)

All stdout log lines pass through **formatter-level redaction** (`colcoor_backend.observability.redaction`):

- **Messages** and **exception tracebacks** (`error` field) are pattern-scrubbed (Bearer tokens, JWTs, license keys, URL credentials, env-style secrets).
- **Structured `extra` fields** and **`log_event()` kwargs** are key-scrubbed (sensitive keys → `***`; blocked payload keys → `[OMITTED]`).
- Applies to **JSON (production)** and **text (development)** formatters.
- Redaction is **best-effort and fail-closed** (`[REDACTION_FAILED]` on internal errors). Prefer **over-redaction** to under-redaction.

Redaction does **not** make it safe to log request/response bodies, tokens, or `colcoor_agent_trace` content — **do not log those by policy**. The formatter is a last line of defense when `logger.exception` or mistakes bypass `log_event()`.

**Still do not log:** JWTs, Cursor tokens, raw `Authorization` headers, full idempotency keys, conversation/side-chat message bodies, image bytes, or full agent/tool traces.

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
