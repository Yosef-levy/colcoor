"""Centralized log redaction (formatter last line of defense)."""

from __future__ import annotations

import re
from typing import Any

REDACTION_FAILED = "[REDACTION_FAILED]"
REDACTED = "***"
OMITTED = "[OMITTED]"
MAX_STRING_LEN = 8192
MAX_TRACEBACK_LEN = 32_768
DEFAULT_MAX_DEPTH = 6

# Keys whose values are never emitted (large / high-risk domain payloads).
_BLOCKED_KEYS = frozenset(
    {
        "body",
        "raw_body",
        "request_body",
        "response_body",
        "content_json",
        "colcoor_agent_trace",
        "tool_payload",
        "payload",
    }
)

# Exact sensitive key names (normalized: lower, underscores).
_SENSITIVE_KEYS = frozenset(
    {
        "password",
        "secret",
        "token",
        "authorization",
        "cookie",
        "api_key",
        "apikey",
        "access_token",
        "refresh_token",
        "cursor_access_token",
        "jwt",
        "license_key",
        "bearer",
        "client_secret",
        "idempotency_key",
        "jwt_secret",
        "database_url",
        "database_migration_url",
        "redis_url",
    }
)

# Substrings that mark a key as sensitive (over-redact preferred).
_SENSITIVE_KEY_FRAGMENTS = (
    "password",
    "secret",
    "token",
    "authorization",
    "cookie",
    "api_key",
    "apikey",
    "bearer",
)

_BEARER_RE = re.compile(r"(Bearer\s+)[^\s'\"]+", re.IGNORECASE)
_AUTH_HEADER_RE = re.compile(
    r"(authorization['\"]?\s*[:=]\s*['\"]?)[^\s'\"]+",
    re.IGNORECASE,
)
_COOKIE_RE = re.compile(
    r"(cookie['\"]?\s*[:=]\s*['\"]?)[^\s'\"]+",
    re.IGNORECASE,
)
_TOKEN_KV_RE = re.compile(
    r"(\b(?:access_token|refresh_token|cursor_access_token|api_key|apikey|client_secret|"
    r"idempotency_key|token)['\"]?\s*[:=]\s*['\"]?)[^\s'\"]+",
    re.IGNORECASE,
)
_PASSWORD_KV_RE = re.compile(
    r"(password['\"]?\s*[:=]\s*['\"]?)[^\s'\"]+",
    re.IGNORECASE,
)
_LICENSE_KEY_RE = re.compile(r"(COLCOOR_LICENSE_KEY\s*=\s*)[^\s]+", re.IGNORECASE)
_JWT_SECRET_RE = re.compile(r"(JWT_SECRET\s*=\s*)[^\s]+", re.IGNORECASE)
_DATABASE_URL_RE = re.compile(r"(DATABASE(?:_MIGRATION)?_URL\s*=\s*)[^\s]+", re.IGNORECASE)
_APIKEY_RE = re.compile(r"(api[_-]?key['\"]?\s*[:=]\s*['\"]?)[^\s'\"]+", re.IGNORECASE)
_JWT_RE = re.compile(
    r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
)
_URL_CREDS_RE = re.compile(
    r"((?:postgresql\+asyncpg|postgresql|postgres|redis)://)[^@\s]+@",
    re.IGNORECASE,
)

_STRING_PATTERNS: tuple[re.Pattern[str], ...] = (
    _BEARER_RE,
    _AUTH_HEADER_RE,
    _COOKIE_RE,
    _TOKEN_KV_RE,
    _PASSWORD_KV_RE,
    _LICENSE_KEY_RE,
    _JWT_SECRET_RE,
    _DATABASE_URL_RE,
    _APIKEY_RE,
    _URL_CREDS_RE,
    _JWT_RE,
)


def _normalize_key(key: str) -> str:
    return key.lower().replace("-", "_")


def is_blocked_key(key: str) -> bool:
    return _normalize_key(key) in _BLOCKED_KEYS


def is_sensitive_key(key: str) -> bool:
    norm = _normalize_key(key)
    if norm in _SENSITIVE_KEYS:
        return True
    return any(fragment in norm for fragment in _SENSITIVE_KEY_FRAGMENTS)


def _truncate(text: str, limit: int = MAX_STRING_LEN) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def redact_string(text: str) -> str:
    """Pattern-based redaction for log messages and tracebacks."""
    try:
        if not isinstance(text, str):
            text = str(text)
        if not text:
            return text
        if REDACTED in text and "eyJ" not in text:
            # Idempotent: already redacted placeholders; still run JWT pass.
            pass
        out = text
        for pattern in _STRING_PATTERNS:
            if pattern is _JWT_RE:
                out = pattern.sub(REDACTED, out)
            elif pattern is _URL_CREDS_RE:
                out = pattern.sub(r"\1" + REDACTED + "@", out)
            else:
                out = pattern.sub(r"\1" + REDACTED, out)
        return _truncate(out)
    except Exception:
        return REDACTION_FAILED


def redact_value(
    value: Any,
    *,
    key: str | None = None,
    depth: int = 0,
    max_depth: int = DEFAULT_MAX_DEPTH,
) -> Any:
    """Recursively redact structured log field values."""
    try:
        if key is not None:
            if is_blocked_key(key):
                return OMITTED
            if is_sensitive_key(key):
                return REDACTED

        if depth > max_depth:
            return "[MAX_DEPTH]"

        if value is None or isinstance(value, (bool, int, float)):
            return value

        if isinstance(value, bytes):
            return "[BYTES_OMITTED]"

        if isinstance(value, str):
            return redact_string(_truncate(value))

        if isinstance(value, dict):
            return {
                k: redact_value(v, key=str(k), depth=depth + 1, max_depth=max_depth)
                for k, v in value.items()
            }

        if isinstance(value, (list, tuple)):
            redacted = [
                redact_value(item, key=key, depth=depth + 1, max_depth=max_depth)
                for item in value
            ]
            return type(value)(redacted)

        return redact_string(_truncate(str(value)))
    except Exception:
        return REDACTION_FAILED


def redact_traceback(text: str) -> str:
    """Redact and cap exception traceback text."""
    return _truncate(redact_string(text), MAX_TRACEBACK_LEN)
