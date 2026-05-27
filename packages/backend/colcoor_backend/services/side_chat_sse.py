"""Server-Sent Events for side chat (api-contracts §10.6).

Idle streams are woken via Redis pub/sub (``SideChatWakeHub``) so replicas stay
stateless and do not hold a Postgres ``LISTEN`` connection per SSE client. When
Redis is unavailable or ``COLCOOR_SIDE_CHAT_SSE_DISABLE_NOTIFY=1``, falls back to
polling only.

Also **burst-drains**: after yielding any rows, polls again immediately (no sleep)
until an empty read, so back-to-back messages ship in one sweep.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from colcoor_backend.db.models import SideChatMessage, User
from colcoor_backend.errors.logging_utils import log_event
from colcoor_backend.observability.metrics import SSE_CONNECTIONS_ACTIVE, SSE_STREAM_DISCONNECTS_TOTAL
from colcoor_backend.observability.sse_log_context import (
    SSE_DISCONNECT_CLIENT_CANCELLED,
    SSE_DISCONNECT_COMPLETED,
    SSE_DISCONNECT_ERROR,
    SSE_DISCONNECT_TIMEOUT,
    SseStreamLogContext,
)
from colcoor_backend.services.side_chat import (
    list_side_chat_messages,
    load_users_by_ids,
    side_chat_message_to_out,
)
from colcoor_backend.services.side_chat_wake.hub import SideChatWakeHub

logger = logging.getLogger(__name__)


@dataclass
class _SseRunState:
    last_seq: int
    disconnect_reason: str = SSE_DISCONNECT_COMPLETED


def format_side_chat_sse_event(row: SideChatMessage, author: User | None) -> str:
    """One SSE event: ``data:`` line + blank line. Payload is a single JSON object."""
    out = side_chat_message_to_out(row, author)
    payload: dict[str, object] = {
        "type": "side_chat",
        "message": out.model_dump(mode="json"),
    }
    line = json.dumps(payload, separators=(",", ":"))
    return f"data: {line}\n\n"


async def _poll_and_yield(
    factory: async_sessionmaker[AsyncSession],
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    last: int,
) -> tuple[list[bytes], int]:
    """Load rows with ``seq > last``; return encoded SSE frames and updated cursor."""
    async with factory() as session:
        rows = await list_side_chat_messages(
            session,
            conversation_id,
            user_id,
            after_seq=last,
            include_deleted=True,
        )
        author_ids = [r.author_user_id for r in rows if r.author_user_id is not None]
        authors = await load_users_by_ids(session, author_ids)
    frames: list[bytes] = []
    cursor = last
    for row in rows:
        cursor = row.seq
        au = authors.get(row.author_user_id) if row.author_user_id is not None else None
        frames.append(format_side_chat_sse_event(row, au).encode("utf-8"))
    return frames, cursor


async def _idle_wait(wake: asyncio.Event | None, poll_idle: float) -> None:
    if wake is not None:
        wake.clear()
        try:
            await asyncio.wait_for(wake.wait(), timeout=poll_idle)
        except asyncio.TimeoutError:
            pass
    else:
        await asyncio.sleep(poll_idle)


def _log_sse_stream_close(
    stream_ctx: SseStreamLogContext,
    run: _SseRunState,
    t0: float,
    *,
    error: BaseException | None = None,
) -> None:
    duration_ms = round((time.monotonic() - t0) * 1000, 2)
    level = logging.ERROR if run.disconnect_reason == SSE_DISCONNECT_ERROR else logging.INFO
    log_event(
        logger,
        level,
        "sse_stream_close",
        "side-chat SSE stream closed",
        request=None,
        request_id=stream_ctx.request_id,
        route=stream_ctx.route,
        method=stream_ctx.method,
        user_id=stream_ctx.user_id,
        conversation_id=stream_ctx.conversation_id,
        sse_attempt=stream_ctx.sse_attempt,
        sse_session=stream_ctx.sse_session,
        reconnect=stream_ctx.reconnect,
        after_seq=stream_ctx.after_seq,
        stream_duration_ms=duration_ms,
        last_seq=run.last_seq,
        sse_disconnect_reason=run.disconnect_reason,
        exc_info=error if run.disconnect_reason == SSE_DISCONNECT_ERROR else None,
    )


async def iter_side_chat_sse(
    factory: async_sessionmaker[AsyncSession],
    *,
    wake_hub: SideChatWakeHub | None,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    after_seq: int,
    stream_ctx: SseStreamLogContext,
) -> AsyncIterator[bytes]:
    """
    Emit new ``side_chat_messages`` rows as SSE frames.

    ``COLCOOR_SIDE_CHAT_SSE_POLL_SEC`` — max seconds to wait when idle (default ``0.12``).

    ``COLCOOR_SIDE_CHAT_SSE_MAX_SECONDS`` — if ``> 0``, stop after this wall time (tests only).

    ``COLCOOR_SIDE_CHAT_SSE_DISABLE_NOTIFY`` — if ``1``, skip Redis wakeups and poll only.
    """
    poll_idle = float(os.environ.get("COLCOOR_SIDE_CHAT_SSE_POLL_SEC", "0.12") or "0.12")
    max_sec = float(os.environ.get("COLCOOR_SIDE_CHAT_SSE_MAX_SECONDS", "0") or "0")
    poll_only = os.environ.get("COLCOOR_SIDE_CHAT_SSE_DISABLE_NOTIFY", "").strip() == "1"
    use_redis = wake_hub is not None and not poll_only

    run = _SseRunState(last_seq=after_seq)
    t0 = time.monotonic()
    SSE_CONNECTIONS_ACTIVE.inc()
    stream_error: BaseException | None = None

    try:
        if use_redis:
            assert wake_hub is not None
            async with wake_hub.subscribe(conversation_id) as wake:
                async for chunk in _run_sse_loop(
                    factory,
                    conversation_id=conversation_id,
                    user_id=user_id,
                    run=run,
                    poll_idle=poll_idle,
                    max_sec=max_sec,
                    t0=t0,
                    wake=wake,
                ):
                    if isinstance(chunk, int):
                        run.last_seq = chunk
                    else:
                        yield chunk
        else:
            async for chunk in _run_sse_loop(
                factory,
                conversation_id=conversation_id,
                user_id=user_id,
                run=run,
                poll_idle=poll_idle,
                max_sec=max_sec,
                t0=t0,
                wake=None,
            ):
                if isinstance(chunk, int):
                    run.last_seq = chunk
                else:
                    yield chunk
    except asyncio.CancelledError:
        run.disconnect_reason = SSE_DISCONNECT_CLIENT_CANCELLED
        raise
    except Exception as exc:
        run.disconnect_reason = SSE_DISCONNECT_ERROR
        stream_error = exc
        raise
    finally:
        SSE_CONNECTIONS_ACTIVE.dec()
        SSE_STREAM_DISCONNECTS_TOTAL.labels(reason=run.disconnect_reason).inc()
        _log_sse_stream_close(stream_ctx, run, t0, error=stream_error)


async def _run_sse_loop(
    factory: async_sessionmaker[AsyncSession],
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    run: _SseRunState,
    poll_idle: float,
    max_sec: float,
    t0: float,
    wake: asyncio.Event | None,
) -> AsyncIterator[bytes | int]:
    cursor = run.last_seq
    while True:
        frames, cursor = await _poll_and_yield(
            factory,
            conversation_id=conversation_id,
            user_id=user_id,
            last=cursor,
        )
        for frame in frames:
            yield frame
        if frames:
            yield cursor
            continue

        await _idle_wait(wake, poll_idle)

        if max_sec > 0 and (time.monotonic() - t0) >= max_sec:
            run.disconnect_reason = SSE_DISCONNECT_TIMEOUT
            break
