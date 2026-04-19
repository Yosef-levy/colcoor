"""Hard-delete graph events that have been soft-deleted longer than the retention window."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, exists, literal, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import aliased

from colcoor_backend.core.config import Settings
from colcoor_backend.db.models import Conversation, ConversationUserState, Event

logger = logging.getLogger(__name__)

# Session-level advisory lock so only one Gunicorn worker purges at a time (Postgres).
_EVENT_PURGE_LOCK_KEY = 384_711_902

_LEAF_BATCH = 500


async def _conversation_root_event_id(session: AsyncSession, conversation_id: uuid.UUID) -> uuid.UUID:
    res = await session.execute(
        select(Event.id).where(
            Event.conversation_id == conversation_id,
            Event.parent_event_id.is_(None),
            Event.deleted_at.is_(None),
        )
    )
    rid = res.scalar_one_or_none()
    if rid is None:
        raise RuntimeError("conversation has no live root event")
    return rid


async def _repoint_active_events_pointing_at_purge_set(session: AsyncSession, cutoff: datetime) -> None:
    dead_subq = select(Event.id).where(Event.deleted_at.isnot(None), Event.deleted_at < cutoff)
    st_rows = (
        await session.scalars(select(ConversationUserState).where(ConversationUserState.active_event_id.in_(dead_subq)))
    ).all()
    for st in st_rows:
        st.active_event_id = await _conversation_root_event_id(session, st.conversation_id)


async def purge_soft_deleted_events(session: AsyncSession, *, older_than: timedelta) -> int:
    """Hard-delete events with ``deleted_at`` older than ``now - older_than`` (leaf-first for FK RESTRICT).

    Uses ``pg_try_advisory_lock`` so multiple API workers do not purge concurrently. Returns the number
    of ``events`` rows removed (0 if the lock was not acquired or there was nothing to purge).
    """
    cutoff = datetime.now(tz=UTC) - older_than
    locked = (
        await session.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": _EVENT_PURGE_LOCK_KEY})
    ).scalar_one()
    if not locked:
        logger.info("event purge skipped (advisory lock held by another session)")
        return 0
    total = 0
    try:
        await _repoint_active_events_pointing_at_purge_set(session, cutoff)
        await session.flush()
        while True:
            child = aliased(Event)
            stmt = (
                select(Event.id)
                .where(
                    Event.deleted_at.isnot(None),
                    Event.deleted_at < cutoff,
                    ~exists(select(literal(1)).where(child.parent_event_id == Event.id)),
                )
                .limit(_LEAF_BATCH)
            )
            res = await session.execute(stmt)
            ids = [row[0] for row in res.all()]
            if not ids:
                break
            await session.execute(delete(Event).where(Event.id.in_(ids)))
            await session.flush()
            total += len(ids)
        conv_n = 0
        while True:
            res_c = await session.execute(
                select(Conversation.id).where(
                    Conversation.deleted_at.isnot(None),
                    Conversation.deleted_at < cutoff,
                    ~exists(select(literal(1)).where(Event.conversation_id == Conversation.id)),
                ).limit(100)
            )
            cids = [row[0] for row in res_c.all()]
            if not cids:
                break
            await session.execute(delete(Conversation).where(Conversation.id.in_(cids)))
            await session.flush()
            conv_n += len(cids)
        if conv_n:
            logger.info(
                "event purge removed %s soft-deleted conversation row(s) with no events (cutoff=%s)",
                conv_n,
                cutoff.isoformat(),
            )
        if total:
            logger.info("event purge removed %s soft-deleted event row(s) (cutoff=%s)", total, cutoff.isoformat())
        return total
    finally:
        await session.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _EVENT_PURGE_LOCK_KEY})


def spawn_event_purge_scheduler(
    session_factory: async_sessionmaker[AsyncSession],
    settings: Settings,
) -> asyncio.Task[None] | None:
    """Background loop: purge after ``initial_delay``, then every ``interval`` seconds."""
    if not settings.event_purge_scheduler_enabled:
        return None
    interval = settings.event_purge_interval_seconds
    initial = settings.event_purge_initial_delay_seconds
    retention = timedelta(hours=settings.event_soft_delete_retention_hours)

    async def _worker() -> None:
        await asyncio.sleep(initial)
        while True:
            try:
                async with session_factory() as session:
                    try:
                        n = await purge_soft_deleted_events(session, older_than=retention)
                        await session.commit()
                        if n:
                            logger.info("scheduled event purge committed (%s rows)", n)
                    except Exception:
                        await session.rollback()
                        raise
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("scheduled event purge failed")
            await asyncio.sleep(interval)

    return asyncio.create_task(_worker(), name="colcoor_event_purge_scheduler")
