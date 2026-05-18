"""FastAPI middleware: per-user JWT ``sub`` limits with IP fallback for anonymous traffic."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from colcoor_backend.core.config import Settings, get_settings
from colcoor_backend.errors import codes
from colcoor_backend.errors.responses import error_response
from colcoor_backend.rate_limit.backends import InMemoryRateLimitStore, RateLimitBackend
from colcoor_backend.rate_limit.keys import rate_limit_key

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

logger = logging.getLogger(__name__)

RATE_LIMIT_SKIP_PATHS = frozenset({"/health", "/ready"})

_RATE_LIMIT_MESSAGE = "Rate limit exceeded. Try again shortly."


def _limits_for_key(
    key: str,
    settings: Settings,
) -> tuple[float, float]:
    if key.startswith("user:"):
        return settings.rate_limit_rps_per_user, settings.rate_limit_burst_per_user
    return settings.rate_limit_rps_anon, settings.rate_limit_burst_anon


def _store_for_request(request: Request) -> RateLimitBackend:
    state = request.app.state
    backend = getattr(state, "rate_limit_store", None)
    if backend is None:
        backend = InMemoryRateLimitStore()
        state.rate_limit_store = backend
    return backend


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Token-bucket rate limiting before route handlers run."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return await call_next(request)

        path = request.url.path
        if path in RATE_LIMIT_SKIP_PATHS:
            return await call_next(request)

        key = rate_limit_key(request, settings)
        rate, burst = _limits_for_key(key, settings)
        backend = _store_for_request(request)

        if not await backend.allow(key, rate=rate, burst=burst):
            logger.info(
                "rate limit exceeded key=%s path=%s",
                key.split(":", 1)[0],
                path,
            )
            return error_response(
                request,
                status_code=429,
                code=codes.RATE_LIMITED,
                message=_RATE_LIMIT_MESSAGE,
            )

        return await call_next(request)
