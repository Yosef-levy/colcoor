"""Idempotency for graph append-event (client ``Idempotency-Key`` header)."""

from __future__ import annotations

import asyncio
import re
import time
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from colcoor_backend.db.models import AppendEventIdempotency, Event
from colcoor_backend.observability.metrics import APPEND_EVENT_IDEMPOTENCY_TOTAL
from colcoor_backend.services.graph import append_graph_event

IDEMPOTENCY_KEY_HEADER = "Idempotency-Key"
_IDEMPOTENCY_KEY_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
_IN_FLIGHT_WAIT_SECONDS = 30.0
_IN_FLIGHT_POLL_INTERVAL = 0.05


class IdempotencyKeyError(ValueError):
    """Raised when the client-supplied idempotency key is missing or invalid."""


def normalize_idempotency_key(raw: str | None) -> str:
    """Validate ``Idempotency-Key`` (required on append-event)."""
    if raw is None or not raw.strip():
        raise IdempotencyKeyError("Idempotency-Key header is required")
    key = raw.strip()
    if not _IDEMPOTENCY_KEY_RE.match(key):
        raise IdempotencyKeyError(
            "Idempotency-Key must be 1–128 characters (letters, digits, . _ : -)"
        )
    return key


async def _load_idempotency_row(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    idempotency_key: str,
    for_update: bool = False,
) -> AppendEventIdempotency | None:
    stmt = select(AppendEventIdempotency).where(
        AppendEventIdempotency.conversation_id == conversation_id,
        AppendEventIdempotency.user_id == user_id,
        AppendEventIdempotency.idempotency_key == idempotency_key,
    )
    if for_update:
        stmt = stmt.with_for_update()
    res = await session.execute(stmt)
    return res.scalar_one_or_none()


async def _wait_for_in_flight_event_id(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    idempotency_key: str,
) -> uuid.UUID:
    """Another request holds the idempotency row; wait until ``event_id`` is set."""
    deadline = time.monotonic() + _IN_FLIGHT_WAIT_SECONDS
    while time.monotonic() < deadline:
        row = await _load_idempotency_row(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
        if row is not None and row.event_id is not None:
            return row.event_id
        await asyncio.sleep(_IN_FLIGHT_POLL_INTERVAL)
    raise TimeoutError("idempotency key still in flight after timeout")


async def _return_replayed_event(session: AsyncSession, event_id: uuid.UUID) -> tuple[Event, bool]:
    ev = await session.get(Event, event_id)
    if ev is None:
        raise RuntimeError("idempotency row references missing event")
    APPEND_EVENT_IDEMPOTENCY_TOTAL.labels(result="replayed").inc()
    return ev, True


async def append_graph_event_idempotent(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    idempotency_key: str,
    kind: str,
    parent_event_id: uuid.UUID,
    content: str,
    private_branch: bool,
    content_json: dict | None = None,
    checkpoint_label: str | None = None,
) -> tuple[Event, bool]:
    """Append a graph event, deduping on ``(conversation_id, user_id, idempotency_key)``.

    Returns ``(event, replayed)`` where ``replayed`` is True when an existing row was returned.
    """
    existing = await _load_idempotency_row(
        session,
        conversation_id=conversation_id,
        user_id=user_id,
        idempotency_key=idempotency_key,
        for_update=True,
    )
    if existing is not None:
        if existing.event_id is not None:
            return await _return_replayed_event(session, existing.event_id)
        event_id = await _wait_for_in_flight_event_id(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
        return await _return_replayed_event(session, event_id)

    insert_stmt = (
        pg_insert(AppendEventIdempotency)
        .values(
            conversation_id=conversation_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
            event_id=None,
        )
        .on_conflict_do_nothing(
            index_elements=[
                AppendEventIdempotency.conversation_id,
                AppendEventIdempotency.user_id,
                AppendEventIdempotency.idempotency_key,
            ]
        )
        .returning(AppendEventIdempotency.conversation_id)
    )
    won = (await session.execute(insert_stmt)).scalar_one_or_none() is not None
    if not won:
        row = await _load_idempotency_row(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
            for_update=True,
        )
        if row is not None and row.event_id is not None:
            return await _return_replayed_event(session, row.event_id)
        event_id = await _wait_for_in_flight_event_id(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
        return await _return_replayed_event(session, event_id)

    ev = await append_graph_event(
        session,
        conversation_id=conversation_id,
        user_id=user_id,
        kind=kind,
        parent_event_id=parent_event_id,
        content=content,
        private_branch=private_branch,
        content_json=content_json,
        checkpoint_label=checkpoint_label,
    )
    row = await _load_idempotency_row(
        session,
        conversation_id=conversation_id,
        user_id=user_id,
        idempotency_key=idempotency_key,
        for_update=True,
    )
    if row is None:
        raise RuntimeError("idempotency placeholder missing after insert")
    row.event_id = ev.id
    await session.flush()
    APPEND_EVENT_IDEMPOTENCY_TOTAL.labels(result="created").inc()
    return ev, False
