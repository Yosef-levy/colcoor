"""Stable JSON log schema and event_type taxonomy for Colcoor API logs."""

from __future__ import annotations

import logging

SERVICE_NAME = "colcoor-api"

# Tier-1 event types (snake_case, low cardinality). See docs/ops/monitoring.md.
KNOWN_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "http_request",
        "license_user_limit_reached",
        "http_exception",
        "validation_error",
        "infrastructure_error",
        "unhandled_exception",
        "sse_stream_open",
        "sse_stream_close",
    }
)

# LogRecord extras copied into JSON (flat allowlist). High-risk keys redact to [OMITTED].
RECORD_EXTRA_KEYS: tuple[str, ...] = (
    "event_type",
    "request_id",
    "route",
    "method",
    "status",
    "latency_ms",
    "user_id",
    "error_code",
    "conversation_id",
    "sse_attempt",
    "sse_session",
    "reconnect",
    "after_seq",
    "stream_duration_ms",
    "last_seq",
    "sse_disconnect_reason",
    "content_json",
    "colcoor_agent_trace",
)

# Stable emission order for Loki/ELK (insertion order in json.dumps).
JSON_FIELD_ORDER: tuple[str, ...] = (
    "timestamp",
    "level",
    "service",
    "env",
    "logger",
    "message",
    "event_type",
    "request_id",
    "instance_id",
    "method",
    "route",
    "status",
    "latency_ms",
    "user_id",
    "error_code",
    "conversation_id",
    "sse_attempt",
    "sse_session",
    "reconnect",
    "after_seq",
    "stream_duration_ms",
    "last_seq",
    "sse_disconnect_reason",
    "content_json",
    "colcoor_agent_trace",
    "error",
)

_warned_unknown_event_types: set[str] = set()

_logger = logging.getLogger(__name__)


def is_known_event_type(event_type: str) -> bool:
    return event_type in KNOWN_EVENT_TYPES


def warn_unknown_event_type_once(event_type: str) -> None:
    """Warn once per unknown event_type per process (avoid log storms)."""
    if is_known_event_type(event_type):
        return
    if event_type in _warned_unknown_event_types:
        return
    _warned_unknown_event_types.add(event_type)
    _logger.warning(
        "Unknown log event_type=%r (not in KNOWN_EVENT_TYPES); emit allowed but fix taxonomy",
        event_type,
    )


def reset_unknown_event_type_warnings() -> None:
    """Test helper: clear warn-once state."""
    _warned_unknown_event_types.clear()
