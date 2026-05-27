"""SSE-related Prometheus metrics."""

from __future__ import annotations

from colcoor_backend.observability.metrics import (
    APPEND_EVENT_IDEMPOTENCY_TOTAL,
    REDIS_LISTENER_ERRORS_TOTAL,
    REDIS_LISTENER_RECONNECTS_TOTAL,
    SSE_RECONNECTS_TOTAL,
    SSE_STREAM_DISCONNECTS_TOTAL,
    SSE_STREAM_OPENS_TOTAL,
)
from colcoor_backend.observability.sse_log_context import (
    SSE_DISCONNECT_CLIENT_CANCELLED,
    SSE_DISCONNECT_TIMEOUT,
)


def test_sse_metric_counters_exist() -> None:
    """Smoke: labels register without raising."""
    SSE_STREAM_OPENS_TOTAL.labels(reconnect="false").inc()
    SSE_STREAM_OPENS_TOTAL.labels(reconnect="true").inc()
    SSE_RECONNECTS_TOTAL.inc()
    SSE_STREAM_DISCONNECTS_TOTAL.labels(reason=SSE_DISCONNECT_TIMEOUT).inc()
    SSE_STREAM_DISCONNECTS_TOTAL.labels(reason=SSE_DISCONNECT_CLIENT_CANCELLED).inc()
    REDIS_LISTENER_RECONNECTS_TOTAL.inc()
    REDIS_LISTENER_ERRORS_TOTAL.inc()
    APPEND_EVENT_IDEMPOTENCY_TOTAL.labels(result="created").inc()
    APPEND_EVENT_IDEMPOTENCY_TOTAL.labels(result="replayed").inc()
