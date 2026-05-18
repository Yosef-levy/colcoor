"""SSE-related Prometheus metrics."""

from __future__ import annotations

from colcoor_backend.observability.metrics import (
    SSE_RECONNECTS_TOTAL,
    SSE_STREAM_OPENS_TOTAL,
)


def test_sse_metric_counters_exist() -> None:
    """Smoke: labels register without raising."""
    SSE_STREAM_OPENS_TOTAL.labels(reconnect="false").inc()
    SSE_STREAM_OPENS_TOTAL.labels(reconnect="true").inc()
    SSE_RECONNECTS_TOTAL.inc()
