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

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from colcoor_backend.db.models import SideChatMessage, User
from colcoor_backend.services.side_chat import (
    list_side_chat_messages,
    load_users_by_ids,
    side_chat_message_to_out,
)
from colcoor_backend.observability.metrics import SSE_CONNECTIONS_ACTIVE
from colcoor_backend.services.side_chat_wake.hub import SideChatWakeHub

logger = logging.getLogger(__name__)


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


async def iter_side_chat_sse(
    factory: async_sessionmaker[AsyncSession],
    *,
    wake_hub: SideChatWakeHub | None,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    after_seq: int,
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

    last = after_seq
    t0 = time.monotonic()
    SSE_CONNECTIONS_ACTIVE.inc()

    try:
        if use_redis:
            assert wake_hub is not None
            async with wake_hub.subscribe(conversation_id) as wake:
                async for chunk in _run_sse_loop(
                    factory,
                    conversation_id=conversation_id,
                    user_id=user_id,
                    last=last,
                    poll_idle=poll_idle,
                    max_sec=max_sec,
                    t0=t0,
                    wake=wake,
                ):
                    if isinstance(chunk, int):
                        last = chunk
                    else:
                        yield chunk
        else:
            async for chunk in _run_sse_loop(
                factory,
                conversation_id=conversation_id,
                user_id=user_id,
                last=last,
                poll_idle=poll_idle,
                max_sec=max_sec,
                t0=t0,
                wake=None,
            ):
                if isinstance(chunk, int):
                    last = chunk
                else:
                    yield chunk
    finally:
        SSE_CONNECTIONS_ACTIVE.dec()


async def _run_sse_loop(
    factory: async_sessionmaker[AsyncSession],
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    last: int,
    poll_idle: float,
    max_sec: float,
    t0: float,
    wake: asyncio.Event | None,
) -> AsyncIterator[bytes | int]:
    cursor = last
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
            break
