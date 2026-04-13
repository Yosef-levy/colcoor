"""Side chat persistence (api-contracts §10, permissions.md)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from colcoor_backend.db.models import Conversation, Event, Note, SideChatMessage, UserSideChatState
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


async def list_side_chat_messages(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    after_seq: int,
) -> list[SideChatMessage]:
    await ensure_conversation_member(session, conversation_id, user_id)
    res = await session.execute(
        select(SideChatMessage)
        .where(
            SideChatMessage.conversation_id == conversation_id,
            SideChatMessage.seq > after_seq,
        )
        .order_by(SideChatMessage.seq.asc())
    )
    return list(res.scalars().all())


async def post_user_side_chat_message(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    body: str,
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
    await session.flush()
    await session.refresh(msg)
    return msg


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
