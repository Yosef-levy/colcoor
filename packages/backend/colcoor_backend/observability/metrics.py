"""Prometheus metrics (prometheus_client)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from prometheus_client import Counter, Gauge, Histogram, generate_latest
from prometheus_client import CONTENT_TYPE_LATEST

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncEngine

# Paths excluded from HTTP request metrics (scrapers / probes).
SKIP_HTTP_METRICS_PATHS = frozenset({"/metrics", "/health", "/ready"})

HTTP_REQUESTS_TOTAL = Counter(
    "colcoor_http_requests_total",
    "HTTP requests",
    ["method", "route", "status"],
)
HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "colcoor_http_request_duration_seconds",
    "HTTP request latency",
    ["method", "route"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0),
)
SSE_CONNECTIONS_ACTIVE = Gauge(
    "colcoor_sse_connections_active",
    "Active side-chat SSE streams on this worker",
)
REDIS_PUBLISH_TOTAL = Counter(
    "colcoor_redis_publish_total",
    "Side-chat Redis PUBLISH attempts",
    ["result"],
)
REDIS_SUBSCRIBED_CHANNELS = Gauge(
    "colcoor_redis_subscribed_channels",
    "Redis pub/sub channels subscribed on this worker",
)
REDIS_SSE_WAITERS = Gauge(
    "colcoor_redis_sse_waiters",
    "Local SSE waiter events registered for Redis wakeups",
)
DB_POOL_SIZE = Gauge(
    "colcoor_db_pool_size",
    "Configured SQLAlchemy pool size",
)
DB_POOL_CHECKED_OUT = Gauge(
    "colcoor_db_pool_checked_out",
    "Connections currently checked out from the pool",
)
DB_POOL_OVERFLOW = Gauge(
    "colcoor_db_pool_overflow",
    "Overflow connections in use",
)
DB_POOL_CHECKED_IN = Gauge(
    "colcoor_db_pool_checked_in",
    "Idle connections in the pool",
)


def metrics_content_type() -> str:
    return CONTENT_TYPE_LATEST


def render_metrics(engine: object | None = None) -> bytes:
    if engine is not None:
        update_db_pool_gauges(engine)
    return generate_latest()


def update_db_pool_gauges(engine: object) -> None:
    """Refresh pool gauges from the SQLAlchemy async engine (best-effort)."""
    try:
        pool = getattr(engine, "pool", None)
        if pool is None:
            return
        DB_POOL_SIZE.set(getattr(pool, "size", lambda: 0)())
        DB_POOL_CHECKED_OUT.set(pool.checkedout())
        DB_POOL_OVERFLOW.set(pool.overflow())
        DB_POOL_CHECKED_IN.set(pool.checkedin())
    except Exception:
        pass


def route_label(request_scope: dict) -> str:
    route = request_scope.get("route")
    if route is not None and hasattr(route, "path"):
        return route.path
    path = request_scope.get("path") or ""
    if path in SKIP_HTTP_METRICS_PATHS:
        return path
    return "unmatched"
