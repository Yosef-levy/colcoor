"""Map infrastructure failures to stable API error codes."""

from __future__ import annotations

import asyncio

from sqlalchemy.exc import DBAPIError, OperationalError, TimeoutError as SQLTimeoutError

from colcoor_backend.errors import codes

try:
    from redis.exceptions import ConnectionError as RedisConnectionError
    from redis.exceptions import RedisError
    from redis.exceptions import TimeoutError as RedisTimeoutError
except ImportError:  # pragma: no cover - redis optional at import time
    RedisConnectionError = type("RedisConnectionError", (Exception,), {})  # type: ignore[misc,assignment]
    RedisError = type("RedisError", (Exception,), {})  # type: ignore[misc,assignment]
    RedisTimeoutError = type("RedisTimeoutError", (Exception,), {})  # type: ignore[misc,assignment]


def classify_exception(exc: BaseException) -> tuple[str, str, int] | None:
    """Return (code, user_message, http_status) when recognized."""
    if isinstance(exc, asyncio.TimeoutError):
        return codes.TIMEOUT, "The request timed out. Try again shortly.", 504
    if isinstance(exc, (OperationalError, SQLTimeoutError)):
        return codes.DATABASE_UNAVAILABLE, "Database is temporarily unavailable.", 503
    if isinstance(exc, DBAPIError):
        return codes.DATABASE_UNAVAILABLE, "Database error. Try again shortly.", 503
    if isinstance(exc, (RedisConnectionError, RedisTimeoutError)):
        return codes.REDIS_UNAVAILABLE, "Realtime service is temporarily unavailable.", 503
    if isinstance(exc, RedisError):
        return codes.REDIS_UNAVAILABLE, "Realtime service error. Try again shortly.", 503
    if isinstance(exc, ConnectionResetError):
        return codes.BAD_GATEWAY, "Connection was reset. Try again shortly.", 502
    if isinstance(exc, ConnectionError):
        return codes.SERVICE_UNAVAILABLE, "Upstream connection failed. Try again shortly.", 503
    return None
