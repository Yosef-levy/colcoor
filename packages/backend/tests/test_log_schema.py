"""Standardized JSON log schema and event_type taxonomy (Phase 0.1.3)."""

from __future__ import annotations

import json
import logging

import pytest

from colcoor_backend.errors.logging_utils import log_event
from colcoor_backend.logging_config import JsonLogFormatter, set_log_env
from colcoor_backend.observability.log_schema import (
    JSON_FIELD_ORDER,
    KNOWN_EVENT_TYPES,
    SERVICE_NAME,
    is_known_event_type,
    reset_unknown_event_type_warnings,
    warn_unknown_event_type_once,
)


def _make_record(
    *,
    msg: str = "hello",
    extra: dict | None = None,
) -> logging.LogRecord:
    record = logging.LogRecord(
        name="colcoor.access",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg=msg,
        args=(),
        exc_info=None,
    )
    if extra:
        for key, value in extra.items():
            setattr(record, key, value)
    return record


def test_known_event_types_include_http_request_and_sse() -> None:
    assert "http_request" in KNOWN_EVENT_TYPES
    assert "sse_stream_open" in KNOWN_EVENT_TYPES
    assert "sse_stream_close" in KNOWN_EVENT_TYPES
    assert is_known_event_type("validation_error")


def test_json_formatter_includes_service_and_env() -> None:
    set_log_env("production")
    line = JsonLogFormatter().format(_make_record())
    payload = json.loads(line)
    assert payload["service"] == SERVICE_NAME
    assert payload["env"] == "production"


def test_access_log_event_type_http_request() -> None:
    set_log_env("development")
    line = JsonLogFormatter().format(
        _make_record(
            msg="request completed",
            extra={
                "event_type": "http_request",
                "request_id": "rid-1",
                "method": "GET",
                "route": "/api/v1/health",
                "status": 200,
                "latency_ms": 1.5,
            },
        )
    )
    payload = json.loads(line)
    assert payload["message"] == "request completed"
    assert payload["event_type"] == "http_request"
    assert payload["method"] == "GET"
    assert payload["status"] == 200


def test_sse_allowlisted_fields_emitted() -> None:
    set_log_env("production")
    conv = "550e8400-e29b-41d4-a716-446655440000"
    line = JsonLogFormatter().format(
        _make_record(
            extra={
                "event_type": "sse_stream_open",
                "conversation_id": conv,
                "sse_attempt": 2,
                "sse_session": "sess-abc",
                "reconnect": True,
            },
        )
    )
    payload = json.loads(line)
    assert payload["event_type"] == "sse_stream_open"
    assert payload["conversation_id"] == conv
    assert payload["sse_attempt"] == 2
    assert payload["sse_session"] == "sess-abc"
    assert payload["reconnect"] is True


def test_json_field_order_stable() -> None:
    set_log_env("staging")
    line = JsonLogFormatter().format(
        _make_record(
            extra={
                "event_type": "http_request",
                "request_id": "r1",
                "method": "POST",
                "route": "/api/v1/x",
                "status": 201,
                "latency_ms": 3.0,
                "user_id": "u1",
            },
        )
    )
    payload = json.loads(line)
    keys = list(payload.keys())
    expected = [k for k in JSON_FIELD_ORDER if k in payload]
    assert keys == expected
    assert keys.index("service") < keys.index("event_type")
    assert keys.index("message") < keys.index("request_id")


def test_record_extra_overrides_contextvar_request_id() -> None:
    from colcoor_backend.observability import context as obs_ctx

    token = obs_ctx.request_id_ctx.set("from-ctx")
    try:
        line = JsonLogFormatter().format(
            _make_record(extra={"request_id": "from-record", "event_type": "http_request"})
        )
        payload = json.loads(line)
        assert payload["request_id"] == "from-record"
    finally:
        obs_ctx.request_id_ctx.reset(token)


def test_warn_unknown_event_type_once(caplog: pytest.LogCaptureFixture) -> None:
    reset_unknown_event_type_warnings()
    with caplog.at_level(logging.WARNING, logger="colcoor_backend.observability.log_schema"):
        warn_unknown_event_type_once("totally_unknown_event_xyz")
        warn_unknown_event_type_once("totally_unknown_event_xyz")
        warn_unknown_event_type_once("another_unknown_abc")
    warnings = [r for r in caplog.records if "Unknown log event_type" in r.message]
    assert len(warnings) == 2
    assert any("totally_unknown_event_xyz" in r.message for r in warnings)
    assert any("another_unknown_abc" in r.message for r in warnings)


def test_log_event_unknown_event_type_warns_once(caplog: pytest.LogCaptureFixture) -> None:
    reset_unknown_event_type_warnings()
    logger = logging.getLogger("test.log_schema.log_event")
    logger.handlers.clear()
    logger.setLevel(logging.INFO)
    logger.propagate = False

    with caplog.at_level(logging.WARNING, logger="colcoor_backend.observability.log_schema"):
        log_event(logger, logging.INFO, "unknown_event_type_alpha", "msg one")
        log_event(logger, logging.INFO, "unknown_event_type_alpha", "msg two")
        log_event(logger, logging.INFO, "unknown_event_type_beta", "msg three")

    schema_warnings = [
        r for r in caplog.records if r.name == "colcoor_backend.observability.log_schema"
    ]
    assert len(schema_warnings) == 2
