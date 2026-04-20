"""Server-Sent Events for side chat (api-contracts §10.6).

Wakes idle streams via PostgreSQL ``LISTEN``/``NOTIFY`` (migration ``006_side_chat_pg_notify``)
so new rows appear without waiting for a long poll interval. When ``LISTEN`` is unavailable,
falls back to polling only.

Also **burst-drains**: after yielding any rows, polls again immediately (no sleep) until an empty
read, so back-to-back messages ship in one sweep.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from collections.abc import AsyncIterator, Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from colcoor_backend.db.models import SideChatMessage, User
from colcoor_backend.services.side_chat import (
    list_side_chat_messages,
    load_users_by_ids,
    side_chat_message_to_out,
)

logger = logging.getLogger(__name__)

SIDE_CHAT_NOTIFY_CHANNEL = "colcoor_side_chat"


def format_side_chat_sse_event(row: SideChatMessage, author: User | None) -> str:
    """One SSE event: ``data:`` line + blank line. Payload is a single JSON object."""
    out = side_chat_message_to_out(row, author)
    payload: dict[str, object] = {
        "type": "side_chat",
        "message": out.model_dump(mode="json"),
    }
    line = json.dumps(payload, separators=(",", ":"))
    return f"data: {line}\n\n"


async def iter_side_chat_sse(
    factory: async_sessionmaker[AsyncSession],
    *,
    engine: AsyncEngine | None,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    after_seq: int,
) -> AsyncIterator[bytes]:
    """
    Emit new ``side_chat_messages`` rows as SSE frames.

    ``COLCOOR_SIDE_CHAT_SSE_POLL_SEC`` — max seconds to wait when idle (default ``0.12``); used as
    ``asyncio.wait_for`` timeout when ``LISTEN`` is active, or as ``asyncio.sleep`` when not.

    ``COLCOOR_SIDE_CHAT_SSE_MAX_SECONDS`` — if ``> 0``, stop after this wall time (tests only).

    ``COLCOOR_SIDE_CHAT_SSE_DISABLE_NOTIFY`` — if ``1``, skip ``LISTEN``/``NOTIFY`` and poll only.
    """
    poll_idle = float(os.environ.get("COLCOOR_SIDE_CHAT_SSE_POLL_SEC", "0.12") or "0.12")
    max_sec = float(os.environ.get("COLCOOR_SIDE_CHAT_SSE_MAX_SECONDS", "0") or "0")
    disable_notify = os.environ.get("COLCOOR_SIDE_CHAT_SSE_DISABLE_NOTIFY", "").strip() == "1"

    last = after_seq
    t0 = time.monotonic()
    conv_key = str(conversation_id)

    listen_conn = None
    wake: asyncio.Event | None = None
    ag_listener: Callable[..., None] | None = None
    ag_conn = None

    async def _setup_listen() -> None:
        nonlocal listen_conn, wake, ag_listener, ag_conn
        if engine is None or disable_notify:
            return
        try:
            listen_conn = await engine.connect()
            wake = asyncio.Event()

            def _listener(_connection: object, _pid: int, _channel: str, payload: str | None) -> None:
                if not payload:
                    return
                try:
                    d = json.loads(payload)
                    if d.get("c") == conv_key:
                        wake.set()
                except Exception:
                    pass

            ag_listener = _listener
            # AsyncConnection.execution_options is awaitable (unlike AsyncEngine.execution_options).
            listen_conn = await listen_conn.execution_options(isolation_level="AUTOCOMMIT")
            raw = await listen_conn.get_raw_connection()
            ag_conn = raw.driver_connection
            await ag_conn.add_listener(SIDE_CHAT_NOTIFY_CHANNEL, ag_listener)
            await listen_conn.execute(text("LISTEN colcoor_side_chat"))
        except Exception:
            logger.exception("side_chat_sse: LISTEN unavailable, using poll-only fallback")
            if listen_conn is not None:
                try:
                    await listen_conn.close()
                except Exception:
                    pass
            listen_conn = None
            wake = None
            ag_listener = None
            ag_conn = None

    await _setup_listen()

    try:
        while True:
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
            for row in rows:
                last = row.seq
                au = authors.get(row.author_user_id) if row.author_user_id is not None else None
                yield format_side_chat_sse_event(row, au).encode("utf-8")
            if rows:
                continue

            if wake is not None:
                wake.clear()
                try:
                    await asyncio.wait_for(wake.wait(), timeout=poll_idle)
                except asyncio.TimeoutError:
                    pass
            else:
                await asyncio.sleep(poll_idle)

            if max_sec > 0 and (time.monotonic() - t0) >= max_sec:
                break
    finally:
        if ag_conn is not None and ag_listener is not None:
            try:
                await ag_conn.remove_listener(SIDE_CHAT_NOTIFY_CHANNEL, ag_listener)
            except Exception:
                logger.debug("side_chat_sse: remove_listener", exc_info=True)
        if listen_conn is not None:
            try:
                await listen_conn.execute(text("UNLISTEN colcoor_side_chat"))
            except Exception:
                logger.debug("side_chat_sse: UNLISTEN", exc_info=True)
            try:
                await listen_conn.close()
            except Exception:
                pass
