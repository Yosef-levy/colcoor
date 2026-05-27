"""Structured logging helpers (request id, route, user id, no secrets)."""

from __future__ import annotations

import logging
from typing import Any

from starlette.requests import Request

from colcoor_backend.observability import context as obs_ctx
from colcoor_backend.observability.log_schema import warn_unknown_event_type_once
from colcoor_backend.observability.redaction import redact_string, redact_value

# Backward-compatible alias used by tests and call sites.
redact_secrets = redact_string


def _request_context(request: Request | None) -> dict[str, Any]:
    ctx: dict[str, Any] = {}
    if request is not None:
        rid = getattr(request.state, "request_id", None)
        if rid:
            ctx["request_id"] = rid
        uid = getattr(request.state, "user_id", None) or obs_ctx.user_id_ctx.get()
        if uid:
            ctx["user_id"] = uid
    else:
        rid = obs_ctx.request_id_ctx.get()
        if rid:
            ctx["request_id"] = rid
        uid = obs_ctx.user_id_ctx.get()
        if uid:
            ctx["user_id"] = uid
    route = obs_ctx.route_ctx.get()
    if route:
        ctx["route"] = route
    return ctx


def log_event(
    logger: logging.Logger,
    level: int,
    event_type: str,
    message: str,
    *,
    request: Request | None = None,
    exc_info: bool | BaseException | None = None,
    **fields: Any,
) -> None:
    warn_unknown_event_type_once(event_type)
    raw_extra: dict[str, Any] = {
        "event_type": event_type,
        **_request_context(request),
        **fields,
    }
    extra = {k: redact_value(v, key=k) for k, v in raw_extra.items()}
    logger.log(level, redact_string(message), extra=extra, exc_info=exc_info)


def log_unhandled_exception(
    logger: logging.Logger,
    request: Request,
    exc: BaseException,
    *,
    event_type: str = "unhandled_exception",
) -> None:
    log_event(
        logger,
        logging.ERROR,
        event_type,
        f"Unhandled {type(exc).__name__}: {exc}",
        request=request,
        exc_info=exc,
    )
