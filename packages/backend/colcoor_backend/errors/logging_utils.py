"""Structured logging helpers (request id, route, user id, no secrets)."""

from __future__ import annotations

import logging
import re
from typing import Any

from starlette.requests import Request

from colcoor_backend.observability import context as obs_ctx

_BEARER_RE = re.compile(r"(Bearer\s+)[^\s]+", re.IGNORECASE)
_AUTH_HEADER_RE = re.compile(
    r"(authorization['\"]?\s*[:=]\s*['\"]?)[^\s'\"]+",
    re.IGNORECASE,
)
_TOKEN_KV_RE = re.compile(
    r"(\btoken['\"]?\s*[:=]\s*['\"]?)[^\s'\"]+",
    re.IGNORECASE,
)
_PASSWORD_KV_RE = re.compile(
    r"(password['\"]?\s*[:=]\s*['\"]?)[^\s'\"]+",
    re.IGNORECASE,
)
_LICENSE_KEY_RE = re.compile(r"(COLCOOR_LICENSE_KEY\s*=\s*)[^\s]+", re.IGNORECASE)


def redact_secrets(text: str) -> str:
    for pattern in (
        _BEARER_RE,
        _AUTH_HEADER_RE,
        _TOKEN_KV_RE,
        _PASSWORD_KV_RE,
        _LICENSE_KEY_RE,
    ):
        text = pattern.sub(r"\1***", text)
    return text


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
    extra: dict[str, Any] = {"event_type": event_type, **_request_context(request), **fields}
    logger.log(level, redact_secrets(message), extra=extra, exc_info=exc_info)


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
