"""Stable machine-readable API error codes."""

from __future__ import annotations

# Generic
INTERNAL_ERROR = "internal_error"
VALIDATION_ERROR = "validation_error"
RATE_LIMITED = "rate_limited"

# HTTP-shaped
UNAUTHORIZED = "unauthorized"
FORBIDDEN = "forbidden"
NOT_FOUND = "not_found"
CONFLICT = "conflict"
UNPROCESSABLE = "unprocessable_entity"
SERVICE_UNAVAILABLE = "service_unavailable"
DATABASE_UNAVAILABLE = "database_unavailable"
REDIS_UNAVAILABLE = "redis_unavailable"
TIMEOUT = "timeout"
BAD_GATEWAY = "bad_gateway"
LICENSE_USER_LIMIT_REACHED = "license_user_limit_reached"

_STATUS_DEFAULT_CODE: dict[int, str] = {
    400: "bad_request",
    401: UNAUTHORIZED,
    403: FORBIDDEN,
    404: NOT_FOUND,
    409: CONFLICT,
    422: VALIDATION_ERROR,
    429: RATE_LIMITED,
    503: SERVICE_UNAVAILABLE,
    504: TIMEOUT,
}


def code_for_http_status(http_status: int) -> str:
    return _STATUS_DEFAULT_CODE.get(http_status, f"http_{http_status}")
