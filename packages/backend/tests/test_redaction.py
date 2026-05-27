"""Formatter-level log redaction (Phase 0.1.2)."""

from __future__ import annotations

import json
import logging
import sys

from colcoor_backend.errors.logging_utils import log_event, redact_secrets
from colcoor_backend.logging_config import JsonLogFormatter, RedactingTextFormatter
from colcoor_backend.observability.redaction import (
    OMITTED,
    REDACTED,
    is_blocked_key,
    is_sensitive_key,
    redact_string,
    redact_traceback,
    redact_value,
)


def test_redact_secrets_alias_bearer() -> None:
    raw = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def"
    out = redact_secrets(raw)
    assert "eyJhbGciOi" not in out
    assert REDACTED in out


def test_redact_string_bearer_and_jwt() -> None:
    text = "token Bearer secret-token-123 and jwt eyJhbGciOiJIUzI1NiJ9.x.y"
    out = redact_string(text)
    assert "secret-token-123" not in out
    assert "eyJhbGciOi" not in out


def test_redact_string_license_and_env_style() -> None:
    raw = "COLCOOR_LICENSE_KEY=ls_secret_key_abc123xyz JWT_SECRET=supersecret"
    out = redact_string(raw)
    assert "ls_secret_key_abc123xyz" not in out
    assert "supersecret" not in out
    assert "COLCOOR_LICENSE_KEY=" in out


def test_redact_string_postgres_and_redis_urls() -> None:
    pg = "postgresql+asyncpg://user:pass@db.internal:5432/colcoor"
    redis = "redis://:mysecret@redis.internal:6379/0"
    assert "pass@" not in redact_string(pg)
    assert "mysecret@" not in redact_string(redis)
    assert "***@" in redact_string(pg)
    assert "***@" in redact_string(redis)


def test_redact_string_idempotent() -> None:
    once = redact_string("Bearer abc123")
    twice = redact_string(once)
    assert once == twice


def test_redact_string_empty_and_non_string_coercion() -> None:
    assert redact_string("") == ""
    assert redact_string(12345) == "12345"  # type: ignore[arg-type]


def test_redact_value_sensitive_keys() -> None:
    assert redact_value("tok", key="access_token") == REDACTED
    assert redact_value("tok", key="cursor_access_token") == REDACTED
    assert redact_value("x", key="API_KEY") == REDACTED


def test_redact_value_blocked_keys() -> None:
    assert redact_value({"trace": 1}, key="colcoor_agent_trace") == OMITTED
    assert redact_value("hello", key="raw_body") == OMITTED
    assert is_blocked_key("content_json")
    assert is_sensitive_key("password")


def test_redact_value_nested_dict() -> None:
    data = {"outer": {"access_token": "leak", "safe": "ok"}}
    out = redact_value(data)
    assert out["outer"]["access_token"] == REDACTED
    assert out["outer"]["safe"] == "ok"


def test_redact_value_max_depth() -> None:
    nested: dict = {"a": {}}
    cur = nested["a"]
    for _ in range(10):
        cur["a"] = {}
        cur = cur["a"]
    out = redact_value(nested, max_depth=2)
    assert "[MAX_DEPTH]" in str(out)


def test_redact_value_bytes_and_primitives() -> None:
    assert redact_value(b"secret") == "[BYTES_OMITTED]"
    assert redact_value(42) == 42
    assert redact_value(None) is None


def test_redact_traceback_caps_length() -> None:
    huge = "Bearer " + "x" * 50_000
    out = redact_traceback(huge)
    assert len(out) <= 32_768
    assert REDACTED in out


def _make_record(
    *,
    msg: str = "hello",
    extra: dict | None = None,
    exc_info: tuple | None = None,
) -> logging.LogRecord:
    record = logging.LogRecord(
        name="test.logger",
        level=logging.ERROR,
        pathname=__file__,
        lineno=1,
        msg=msg,
        args=(),
        exc_info=exc_info,
    )
    if extra:
        for key, value in extra.items():
            setattr(record, key, value)
    return record


def test_json_formatter_redacts_message() -> None:
    line = JsonLogFormatter().format(
        _make_record(msg="Authorization: Bearer leaked-token-value")
    )
    payload = json.loads(line)
    assert "leaked-token-value" not in payload["message"]
    assert REDACTED in payload["message"]


def test_json_formatter_redacts_extra_fields() -> None:
    line = JsonLogFormatter().format(
        _make_record(
            extra={
                "event_type": "test",
                "method": "GET Bearer cursor_secret_abc",
            }
        )
    )
    payload = json.loads(line)
    assert "cursor_secret_abc" not in payload["method"]
    assert REDACTED in payload["method"]


def test_json_formatter_redacts_exc_info() -> None:
    secret = "Bearer eyJhbGciOiJIUzI1NiJ9.leak.leak"
    try:
        raise RuntimeError(f"failed auth {secret}")
    except RuntimeError:
        exc_info = sys.exc_info()
    line = JsonLogFormatter().format(_make_record(exc_info=exc_info))
    payload = json.loads(line)
    assert "error" in payload
    assert "eyJhbGciOi" not in payload["error"]
    assert "leak.leak" not in payload["error"]


def test_json_formatter_blocked_content_json() -> None:
    line = JsonLogFormatter().format(
        _make_record(extra={"content_json": {"colcoor_agent_trace": {"x": 1}}})
    )
    payload = json.loads(line)
    assert payload["content_json"] == OMITTED


def test_redacting_text_formatter() -> None:
    record = _make_record(msg="password=hidden123")
    line = RedactingTextFormatter(
        "%(levelname)s %(message)s",
    ).format(record)
    assert "hidden123" not in line
    assert REDACTED in line


class _CaptureHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def test_log_event_redacts_extra_on_record() -> None:
    logger = logging.getLogger("test.redaction.log_event")
    handler = _CaptureHandler()
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False
    log_event(
        logger,
        logging.INFO,
        "test_event",
        "Bearer leak-token",
        access_token="must-not-appear",
    )
    assert handler.records
    record = handler.records[-1]
    assert record.access_token == REDACTED
    assert "leak-token" not in record.getMessage()