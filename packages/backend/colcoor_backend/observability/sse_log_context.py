"""Frozen snapshot for side-chat SSE lifecycle logs (survives after middleware resets contextvars)."""

from __future__ import annotations

from dataclasses import dataclass

from starlette.requests import Request

from colcoor_backend.observability.metrics import route_label

# Low-cardinality disconnect reasons (logs + colcoor_sse_stream_disconnects_total).
SSE_DISCONNECT_CLIENT_CANCELLED = "client_cancelled"
SSE_DISCONNECT_TIMEOUT = "timeout"
SSE_DISCONNECT_ERROR = "error"
SSE_DISCONNECT_COMPLETED = "completed"


@dataclass(frozen=True, slots=True)
class SseStreamLogContext:
    request_id: str
    route: str
    user_id: str
    conversation_id: str
    sse_attempt: int
    sse_session: str | None
    reconnect: bool
    after_seq: int
    method: str = "GET"


def build_sse_stream_log_context(
    request: Request,
    *,
    user_id: object,
    conversation_id: object,
    after_seq: int,
    sse_attempt: int,
    sse_session: str | None,
    reconnect: bool,
) -> SseStreamLogContext:
    """Capture request-scoped fields before ``StreamingResponse`` returns."""
    rid = getattr(request.state, "request_id", None)
    return SseStreamLogContext(
        request_id=str(rid) if rid else "",
        route=route_label(request.scope),
        user_id=str(user_id),
        conversation_id=str(conversation_id),
        sse_attempt=sse_attempt,
        sse_session=sse_session or None,
        reconnect=reconnect,
        after_seq=after_seq,
        method=request.method,
    )
