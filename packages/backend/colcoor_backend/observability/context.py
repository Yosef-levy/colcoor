"""Request-scoped context for structured logs (async-safe via contextvars)."""

from __future__ import annotations

import contextvars

request_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "colcoor_request_id", default=None
)
route_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "colcoor_route", default=None
)
user_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "colcoor_user_id", default=None
)
