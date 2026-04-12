"""Conversation and event graph persistence."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from colcoor_backend.db.models import (
    Conversation,
    ConversationMember,
    ConversationUserState,
    Event,
    User,
)
from colcoor_backend.services.cursor_identity import VerifiedCursorIdentity


async def upsert_user_by_cursor_sub(
    session: AsyncSession,
    *,
    cursor_sub: str,
    email: str,
    display_name: str,
) -> uuid.UUID:
    now = datetime.now(tz=UTC)
    res = await session.execute(select(User).where(User.cursor_sub == cursor_sub))
    user = res.scalar_one_or_none()
    if user:
        user.email = email
        user.display_name = display_name or user.display_name
        user.last_login_at = now
    else:
        user = User(
            cursor_sub=cursor_sub,
            email=email,
            display_name=display_name or "",
            last_login_at=now,
        )
        session.add(user)
    await session.flush()
    await session.refresh(user)
    return user.id


async def upsert_user_from_verified_identity(
    session: AsyncSession,
    identity: VerifiedCursorIdentity,
) -> uuid.UUID:
    """Create or update user from IdP-verified Cursor / VS Code account (cursor_sub + profile)."""
    now = datetime.now(tz=UTC)
    res = await session.execute(select(User).where(User.cursor_sub == identity.cursor_sub))
    user = res.scalar_one_or_none()
    if user:
        user.email = identity.email
        user.display_name = identity.display_name or user.display_name
        if identity.avatar_url is not None:
            user.avatar_url = identity.avatar_url
        user.last_login_at = now
    else:
        user = User(
            cursor_sub=identity.cursor_sub,
            email=identity.email,
            display_name=identity.display_name or "",
            avatar_url=identity.avatar_url,
            last_login_at=now,
        )
        session.add(user)
    await session.flush()
    await session.refresh(user)
    return user.id


async def ensure_conversation_member(
    session: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    res = await session.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )
    if res.scalar_one_or_none() is None:
        raise PermissionError("not a member of this conversation")


async def create_conversation_with_owner(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    title: str | None,
) -> tuple[Conversation, ConversationMember]:
    now = datetime.now(tz=UTC)
    conv = Conversation(title=title)
    session.add(conv)
    await session.flush()
    member = ConversationMember(
        conversation_id=conv.id, user_id=user_id, role="owner", pinned=False
    )
    session.add(member)
    root = Event(
        conversation_id=conv.id,
        parent_event_id=None,
        kind="user_input",
        actor_type="user",
        actor_user_id=user_id,
        content_text="",
        content_json=None,
        visible_to=None,
        deleted_at=None,
        created_at=now,
        updated_at=now,
    )
    session.add(root)
    await session.flush()
    session.add(
        ConversationUserState(
            conversation_id=conv.id,
            user_id=user_id,
            active_event_id=root.id,
            last_seen_at=now,
            needs_context_rebuild=False,
        )
    )
    await session.flush()
    await session.refresh(conv)
    await session.refresh(member)
    return conv, member


async def load_event(
    session: AsyncSession, conversation_id: uuid.UUID, event_id: uuid.UUID
) -> Event | None:
    res = await session.execute(
        select(Event).where(
            Event.id == event_id,
            Event.conversation_id == conversation_id,
            Event.deleted_at.is_(None),
        )
    )
    return res.scalar_one_or_none()


async def append_graph_event(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    kind: str,
    parent_event_id: uuid.UUID,
    content: str,
    private_branch: bool,
) -> Event:
    await ensure_conversation_member(session, conversation_id, user_id)
    parent = await load_event(session, conversation_id, parent_event_id)
    if parent is None:
        raise LookupError("parent_event_not_found")
    now = datetime.now(tz=UTC)
    if kind == "assistant_output":
        if parent.kind != "user_input":
            raise ValueError("assistant_output must attach to user_input")
        visible_to = None
        actor_type = "assistant"
        actor_user_id = None
    else:
        visible_to = user_id if private_branch else None
        actor_type = "user"
        actor_user_id = user_id
    ev = Event(
        conversation_id=conversation_id,
        parent_event_id=parent_event_id,
        kind=kind,
        actor_type=actor_type,
        actor_user_id=actor_user_id,
        content_text=content,
        content_json=None,
        visible_to=visible_to,
        deleted_at=None,
        created_at=now,
        updated_at=now,
    )
    session.add(ev)
    conv_r = await session.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_r.scalar_one()
    conv.updated_at = now
    st_r = await session.execute(
        select(ConversationUserState).where(
            ConversationUserState.conversation_id == conversation_id,
            ConversationUserState.user_id == user_id,
        )
    )
    st = st_r.scalar_one_or_none()
    if st:
        st.active_event_id = ev.id
        st.needs_context_rebuild = False
    else:
        session.add(
            ConversationUserState(
                conversation_id=conversation_id,
                user_id=user_id,
                active_event_id=ev.id,
                last_seen_at=now,
                needs_context_rebuild=False,
            )
        )
    await session.flush()
    await session.refresh(ev)
    return ev


async def list_conversations_for_user(
    session: AsyncSession, user_id: uuid.UUID
) -> list[tuple[Conversation, ConversationMember]]:
    stmt = (
        select(Conversation, ConversationMember)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(ConversationMember.user_id == user_id)
        .order_by(ConversationMember.pinned.desc(), Conversation.updated_at.desc())
    )
    res = await session.execute(stmt)
    return list(res.all())


async def get_conversation_member(
    session: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> ConversationMember | None:
    res = await session.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )
    return res.scalar_one_or_none()


async def patch_conversation_for_user(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    patch: dict[str, object],
) -> tuple[Conversation, ConversationMember] | None:
    """Apply keys from ``patch`` (``title``, ``pinned``). ``title`` requires owner/editor."""
    member = await get_conversation_member(session, conversation_id, user_id)
    if member is None:
        return None
    res = await session.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = res.scalar_one_or_none()
    if conv is None:
        return None
    now = datetime.now(tz=UTC)
    if "pinned" in patch:
        member.pinned = bool(patch["pinned"])
    if "title" in patch:
        if member.role not in ("owner", "editor"):
            raise PermissionError("cannot rename conversation")
        t = patch["title"]
        conv.title = None if t is None else str(t)
    conv.updated_at = now
    await session.flush()
    await session.refresh(conv)
    await session.refresh(member)
    return conv, member


async def list_events_for_tree(
    session: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> list[Event]:
    await ensure_conversation_member(session, conversation_id, user_id)
    res = await session.execute(
        select(Event)
        .where(
            Event.conversation_id == conversation_id,
            Event.deleted_at.is_(None),
        )
        .order_by(Event.created_at)
    )
    events = list(res.scalars().all())
    return [e for e in events if e.visible_to is None or e.visible_to == user_id]
