"""Request ID propagation, HTTP metrics, and access-style structured logs."""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from colcoor_backend.observability import context as obs_ctx
from colcoor_backend.observability.metrics import (
    HTTP_ERRORS_TOTAL,
    HTTP_REQUEST_DURATION_SECONDS,
    HTTP_REQUESTS_TOTAL,
    SKIP_HTTP_METRICS_PATHS,
    route_label,
)

logger = logging.getLogger("colcoor.access")
REQUEST_ID_HEADER = "X-Request-ID"


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assign request ID, record HTTP metrics, emit structured access logs."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        incoming = request.headers.get(REQUEST_ID_HEADER)
        request_id = incoming.strip() if incoming and incoming.strip() else str(uuid.uuid4())
        request.state.request_id = request_id

        token_rid = obs_ctx.request_id_ctx.set(request_id)
        token_route = obs_ctx.route_ctx.set(None)
        token_user = obs_ctx.user_id_ctx.set(None)

        path = request.url.path
        skip_metrics = path in SKIP_HTTP_METRICS_PATHS
        method = request.method
        start = time.perf_counter()

        try:
            try:
                response = await call_next(request)
            except Exception:
                elapsed_ms = (time.perf_counter() - start) * 1000
                if not skip_metrics:
                    route = route_label(request.scope)
                    obs_ctx.route_ctx.set(route)
                    HTTP_REQUESTS_TOTAL.labels(method=method, route=route, status="500").inc()
                    HTTP_REQUEST_DURATION_SECONDS.labels(method=method, route=route).observe(
                        elapsed_ms / 1000
                    )
                _log_access(
                    request_id=request_id,
                    method=method,
                    route=obs_ctx.route_ctx.get() or path,
                    status=500,
                    latency_ms=elapsed_ms,
                    user_id=obs_ctx.user_id_ctx.get(),
                    error=True,
                )
                raise

            elapsed_ms = (time.perf_counter() - start) * 1000
            route = route_label(request.scope)
            obs_ctx.route_ctx.set(route)
            status = response.status_code

            if not skip_metrics:
                HTTP_REQUESTS_TOTAL.labels(
                    method=method, route=route, status=str(status)
                ).inc()
                if status >= 400:
                    HTTP_ERRORS_TOTAL.labels(
                        method=method, route=route, status=str(status)
                    ).inc()
                HTTP_REQUEST_DURATION_SECONDS.labels(method=method, route=route).observe(
                    elapsed_ms / 1000
                )

            response.headers[REQUEST_ID_HEADER] = request_id
            _log_access(
                request_id=request_id,
                method=method,
                route=route,
                status=status,
                latency_ms=elapsed_ms,
                user_id=getattr(request.state, "user_id", None) or obs_ctx.user_id_ctx.get(),
                error=status >= 500,
            )
            return response
        finally:
            obs_ctx.request_id_ctx.reset(token_rid)
            obs_ctx.route_ctx.reset(token_route)
            obs_ctx.user_id_ctx.reset(token_user)


def _log_access(
    *,
    request_id: str,
    method: str,
    route: str,
    status: int,
    latency_ms: float,
    user_id: str | None,
    error: bool,
) -> None:
    extra = {
        "event_type": "http_request",
        "request_id": request_id,
        "route": route,
        "method": method,
        "status": status,
        "latency_ms": round(latency_ms, 2),
    }
    if user_id:
        extra["user_id"] = user_id
    if error:
        logger.error("request completed", extra=extra)
    elif status >= 400:
        logger.warning("request completed", extra=extra)
    else:
        logger.info("request completed", extra=extra)
