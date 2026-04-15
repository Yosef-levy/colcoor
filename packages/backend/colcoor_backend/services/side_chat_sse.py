"""Server-Sent Events formatting and polling stream for side chat (api-contracts §10.6)."""

from __future__ import annotations

import asyncio
import json
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
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    after_seq: int,
) -> AsyncIterator[bytes]:
    """
    Poll for new rows with ``seq > last`` and emit SSE ``data:`` frames.

    ``COLCOOR_SIDE_CHAT_SSE_POLL_SEC`` — seconds between polls (default ``0.5``).
    ``COLCOOR_SIDE_CHAT_SSE_MAX_SECONDS`` — if ``> 0``, stop after this wall time (tests only).
    """
    poll = float(os.environ.get("COLCOOR_SIDE_CHAT_SSE_POLL_SEC", "0.5") or "0.5")
    max_sec = float(os.environ.get("COLCOOR_SIDE_CHAT_SSE_MAX_SECONDS", "0") or "0")
    last = after_seq
    t0 = time.monotonic()
    while True:
        async with factory() as session:
            rows = await list_side_chat_messages(
                session, conversation_id, user_id, after_seq=last
            )
            author_ids = [r.author_user_id for r in rows if r.author_user_id is not None]
            authors = await load_users_by_ids(session, author_ids)
        for row in rows:
            last = row.seq
            au = authors.get(row.author_user_id) if row.author_user_id is not None else None
            yield format_side_chat_sse_event(row, au).encode("utf-8")
        await asyncio.sleep(poll)
        if max_sec > 0 and (time.monotonic() - t0) >= max_sec:
            break
