"""Side chat persistence (api-contracts §10, permissions.md)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from collections.abc import Sequence
from typing import Literal

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from colcoor_backend.api.schemas import SideChatMessageOut
from colcoor_backend.db.models import Conversation, Event, Note, SideChatMessage, User, UserSideChatState
from colcoor_backend.services.graph import (
    ensure_conversation_member,
    get_conversation_member,
    load_event,
)


async def _note_in_conversation(
    session: AsyncSession, conversation_id: uuid.UUID, note_id: uuid.UUID
) -> bool:
    res = await session.execute(
        select(Note.id)
        .join(Event, Note.event_id == Event.id)
        .where(Note.id == note_id, Event.conversation_id == conversation_id)
    )
    return res.scalar_one_or_none() is not None


async def _side_chat_message_in_conversation(
    session: AsyncSession, conversation_id: uuid.UUID, message_id: uuid.UUID
) -> bool:
    res = await session.execute(
        select(SideChatMessage.id).where(
            SideChatMessage.id == message_id,
            SideChatMessage.conversation_id == conversation_id,
        )
    )
    return res.scalar_one_or_none() is not None


async def _validate_post_references(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    *,
    referenced_event_id: uuid.UUID | None,
    referenced_note_id: uuid.UUID | None,
    referenced_side_chat_message_id: uuid.UUID | None,
) -> None:
    if referenced_event_id is not None:
        if await load_event(session, conversation_id, referenced_event_id) is None:
            raise ValueError("referenced_event_id not in conversation")
    if referenced_note_id is not None:
        if not await _note_in_conversation(session, conversation_id, referenced_note_id):
            raise ValueError("referenced_note_id not in conversation")
    if referenced_side_chat_message_id is not None:
        if not await _side_chat_message_in_conversation(
            session, conversation_id, referenced_side_chat_message_id
        ):
            raise ValueError("referenced_side_chat_message_id not in conversation")


async def side_chat_unread_count_by_conversation_ids(
    session: AsyncSession,
    user_id: uuid.UUID,
    conversation_ids: Sequence[uuid.UUID],
) -> dict[uuid.UUID, int]:
    """Per conversation: number of non-deleted rows with seq > caller read cursor."""
    ids = list(conversation_ids)
    if not ids:
        return {}
    unread_res = await session.execute(
        select(SideChatMessage.conversation_id, func.count(SideChatMessage.id).label("cnt"))
        .outerjoin(
            UserSideChatState,
            and_(
                UserSideChatState.conversation_id == SideChatMessage.conversation_id,
                UserSideChatState.user_id == user_id,
            ),
        )
        .where(
            SideChatMessage.conversation_id.in_(ids),
            SideChatMessage.deleted_at.is_(None),
            SideChatMessage.seq > func.coalesce(UserSideChatState.last_read_seq, 0),
        )
        .group_by(SideChatMessage.conversation_id)
    )
    unread_by_c: dict[uuid.UUID, int] = {row[0]: int(row[1]) for row in unread_res.all()}
    return {cid: unread_by_c.get(cid, 0) for cid in ids}


async def list_side_chat_messages(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    after_seq: int,
    include_deleted: bool = False,
) -> list[SideChatMessage]:
    """List rows with ``seq > after_seq``.

    Pass ``include_deleted=False`` to omit soft-deleted rows (e.g. internal queries). HTTP GET and
    the SSE poller use ``include_deleted=True`` so clients receive tombstones for transcript and
    incremental sync.
    """
    await ensure_conversation_member(session, conversation_id, user_id)
    cond = [
        SideChatMessage.conversation_id == conversation_id,
        SideChatMessage.seq > after_seq,
    ]
    if not include_deleted:
        cond.append(SideChatMessage.deleted_at.is_(None))
    res = await session.execute(select(SideChatMessage).where(*cond).order_by(SideChatMessage.seq.asc()))
    return list(res.scalars().all())


def _deletion_kind_for_out(msg: SideChatMessage) -> Literal["self", "moderator"] | None:
    if msg.deleted_at is None:
        return None
    db = msg.deleted_by_user_id
    if db is None:
        return None
    au = msg.author_user_id
    if au is not None and db == au:
        return "self"
    return "moderator"


async def load_users_by_ids(
    session: AsyncSession, user_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, User]:
    ids = list({u for u in user_ids if u is not None})
    if not ids:
        return {}
    res = await session.execute(select(User).where(User.id.in_(ids)))
    return {u.id: u for u in res.scalars().all()}


def side_chat_message_to_out(msg: SideChatMessage, author: User | None) -> SideChatMessageOut:
    """Map ORM row + optional author profile to API shape ([ui-features.md] §1.1)."""
    display: str | None = None
    avatar: str | None = None
    if author is not None:
        dn = (author.display_name or "").strip()
        display = dn if dn else None
        avatar = author.avatar_url
    is_deleted = msg.deleted_at is not None
    return SideChatMessageOut(
        id=msg.id,
        conversation_id=msg.conversation_id,
        seq=msg.seq,
        kind=msg.kind,  # type: ignore[arg-type]
        author_user_id=msg.author_user_id,
        author_display_name=display,
        author_avatar_url=avatar,
        body=None if is_deleted else msg.body,
        content_json=None if is_deleted else msg.content_json,
        referenced_event_id=None if is_deleted else msg.referenced_event_id,
        referenced_note_id=None if is_deleted else msg.referenced_note_id,
        referenced_side_chat_message_id=None if is_deleted else msg.referenced_side_chat_message_id,
        created_at=msg.created_at,
        updated_at=msg.updated_at,
        edited_at=None if is_deleted else msg.edited_at,
        deleted_at=msg.deleted_at,
        deleted_by_user_id=msg.deleted_by_user_id if is_deleted else None,
        deletion_kind=_deletion_kind_for_out(msg),
    )


async def side_chat_messages_to_outs(
    session: AsyncSession, messages: Sequence[SideChatMessage]
) -> list[SideChatMessageOut]:
    author_ids = [m.author_user_id for m in messages if m.author_user_id is not None]
    authors = await load_users_by_ids(session, author_ids)
    return [
        side_chat_message_to_out(
            m,
            authors[m.author_user_id] if m.author_user_id is not None else None,
        )
        for m in messages
    ]


async def side_chat_message_to_out_fetched(
    session: AsyncSession, msg: SideChatMessage
) -> SideChatMessageOut:
    author: User | None = None
    if msg.author_user_id is not None:
        author = await session.get(User, msg.author_user_id)
    return side_chat_message_to_out(msg, author)


async def post_user_side_chat_message(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    body: str,
    content_json: dict | None,
    referenced_event_id: uuid.UUID | None,
    referenced_note_id: uuid.UUID | None,
    referenced_side_chat_message_id: uuid.UUID | None,
) -> SideChatMessage:
    await ensure_conversation_member(session, conversation_id, user_id)
    res = await session.execute(
        select(Conversation.id).where(Conversation.id == conversation_id).with_for_update()
    )
    if res.scalar_one_or_none() is None:
        raise LookupError("conversation not found")
    await _validate_post_references(
        session,
        conversation_id,
        referenced_event_id=referenced_event_id,
        referenced_note_id=referenced_note_id,
        referenced_side_chat_message_id=referenced_side_chat_message_id,
    )
    norm_cj: dict | None = None
    if content_json is not None:
        from colcoor_backend.services.conversation_images import normalize_user_media_content_json

        norm_cj = await normalize_user_media_content_json(
            session, conversation_id=conversation_id, content_json=content_json
        )
    max_r = await session.execute(
        select(func.coalesce(func.max(SideChatMessage.seq), 0)).where(
            SideChatMessage.conversation_id == conversation_id
        )
    )
    next_seq = int(max_r.scalar_one()) + 1
    now = datetime.now(tz=UTC)
    msg = SideChatMessage(
        conversation_id=conversation_id,
        seq=next_seq,
        kind="user",
        author_user_id=user_id,
        body=body,
        content_json=norm_cj,
        referenced_event_id=referenced_event_id,
        referenced_note_id=referenced_note_id,
        referenced_side_chat_message_id=referenced_side_chat_message_id,
        created_at=now,
        updated_at=now,
    )
    session.add(msg)
    await session.flush()
    await session.refresh(msg)
    return msg


async def get_side_chat_message(
    session: AsyncSession, conversation_id: uuid.UUID, message_id: uuid.UUID
) -> SideChatMessage | None:
    res = await session.execute(
        select(SideChatMessage).where(
            SideChatMessage.id == message_id,
            SideChatMessage.conversation_id == conversation_id,
        )
    )
    return res.scalar_one_or_none()


async def patch_side_chat_message_body(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    message_id: uuid.UUID,
    *,
    new_body: str,
) -> SideChatMessage:
    await ensure_conversation_member(session, conversation_id, user_id)
    msg = await get_side_chat_message(session, conversation_id, message_id)
    if msg is None:
        raise LookupError("message not found")
    if msg.deleted_at is not None:
        raise LookupError("message deleted")
    if msg.kind != "user":
        raise PermissionError("cannot edit system message")
    if msg.author_user_id != user_id:
        raise PermissionError("not the author")
    now = datetime.now(tz=UTC)
    msg.body = new_body
    msg.updated_at = now
    msg.edited_at = now
    await session.flush()
    await session.refresh(msg)
    return msg


async def soft_delete_side_chat_message(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    message_id: uuid.UUID,
) -> SideChatMessage:
    await ensure_conversation_member(session, conversation_id, user_id)
    member = await get_conversation_member(session, conversation_id, user_id)
    if member is None:
        raise PermissionError("not a member")
    msg = await get_side_chat_message(session, conversation_id, message_id)
    if msg is None:
        raise LookupError("message not found")
    if msg.deleted_at is not None:
        return msg
    role = member.role
    if role != "owner":
        if msg.kind != "user":
            raise PermissionError("cannot delete system message")
        if msg.author_user_id != user_id:
            raise PermissionError("not the author")
    now = datetime.now(tz=UTC)
    msg.deleted_at = now
    msg.updated_at = now
    msg.deleted_by_user_id = user_id
    await session.flush()
    await session.refresh(msg)
    return msg


async def get_user_side_chat_last_read_seq(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
) -> int:
    """Caller’s persisted side-chat read cursor, or 0 when no row exists."""
    row = await session.get(UserSideChatState, (conversation_id, user_id))
    if row is None:
        return 0
    return int(row.last_read_seq)


async def patch_side_chat_read_cursor(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    last_read_seq: int,
) -> None:
    await ensure_conversation_member(session, conversation_id, user_id)
    row = await session.get(UserSideChatState, (conversation_id, user_id))
    if row is None:
        session.add(
            UserSideChatState(
                conversation_id=conversation_id,
                user_id=user_id,
                last_read_seq=last_read_seq,
            )
        )
    else:
        row.last_read_seq = last_read_seq
    await session.flush()
