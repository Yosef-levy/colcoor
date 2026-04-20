"""Conversation and event graph persistence."""

from __future__ import annotations

import re
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from colcoor_backend.db.models import (
    Conversation,
    ConversationMember,
    ConversationUserState,
    Event,
    EventStar,
    Note,
    User,
)
from colcoor_backend.services.cursor_identity import VerifiedCursorIdentity


@dataclass(frozen=True)
class SoftDeleteSubtreeResult:
    deleted_count: int
    deletion_group_id: uuid.UUID | None


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


async def require_live_conversation(session: AsyncSession, conversation_id: uuid.UUID) -> None:
    """Raise ``LookupError`` when the conversation row is missing or owner-soft-deleted."""
    res = await session.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = res.scalar_one_or_none()
    if conv is None:
        raise LookupError("conversation not found")
    if conv.deleted_at is not None:
        raise LookupError("conversation deleted")


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


async def load_event_row_any_status(
    session: AsyncSession, conversation_id: uuid.UUID, event_id: uuid.UUID
) -> Event | None:
    """Return the event row if it exists in the conversation, including soft-deleted rows."""
    res = await session.execute(
        select(Event).where(Event.id == event_id, Event.conversation_id == conversation_id)
    )
    return res.scalar_one_or_none()


async def _collect_non_deleted_subtree_event_ids(
    session: AsyncSession, conversation_id: uuid.UUID, root_id: uuid.UUID
) -> list[uuid.UUID]:
    """Depth-first reachable ids from ``root_id`` over ``parent_event_id`` among non-deleted events."""
    res = await session.execute(
        select(Event.id, Event.parent_event_id, Event.deleted_at).where(
            Event.conversation_id == conversation_id
        )
    )
    children: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
    alive: set[uuid.UUID] = set()
    for eid, pid, d_at in res.all():
        if d_at is not None:
            continue
        alive.add(eid)
        if pid is not None:
            children[pid].append(eid)
    if root_id not in alive:
        return []
    out: list[uuid.UUID] = []
    stack = [root_id]
    seen: set[uuid.UUID] = set()
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        out.append(cur)
        for c in children.get(cur, ()):
            if c in alive:
                stack.append(c)
    return out


async def soft_delete_event_subtree(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    event_id: uuid.UUID,
) -> SoftDeleteSubtreeResult:
    """Set ``deleted_at`` on ``event_id`` and every non-deleted descendant in the same conversation.

    Stars on those events are removed for all users. Members whose ``active_event_id`` was in the
    subtree are moved to the conversation root. All affected rows share a new ``deletion_group_id`` and
    ``deleted_by_user_id`` for undo / restore.
    """
    member = await get_conversation_member(session, conversation_id, user_id)
    if member is None:
        raise PermissionError("not a member")
    if member.role == "viewer":
        raise PermissionError("viewers cannot delete graph subtrees")
    await require_live_conversation(session, conversation_id)
    ev = await load_event_row_any_status(session, conversation_id, event_id)
    if ev is None:
        raise LookupError("event not found")
    if ev.deleted_at is not None:
        return SoftDeleteSubtreeResult(0, None)
    if ev.visible_to is not None and ev.visible_to != user_id:
        raise PermissionError("event not visible")
    root_id = await _conversation_root_event_id(session, conversation_id)
    if ev.id == root_id:
        raise ValueError("cannot delete the conversation root")
    ids = await _collect_non_deleted_subtree_event_ids(session, conversation_id, event_id)
    if not ids:
        return SoftDeleteSubtreeResult(0, None)
    now = datetime.now(tz=UTC)
    group_id = uuid.uuid4()
    await session.execute(
        update(Event)
        .where(Event.id.in_(ids))
        .values(
            deleted_at=now,
            updated_at=now,
            deletion_group_id=group_id,
            deleted_by_user_id=user_id,
        )
    )
    await session.execute(delete(EventStar).where(EventStar.event_id.in_(ids)))
    st_r = await session.execute(
        select(ConversationUserState).where(
            ConversationUserState.conversation_id == conversation_id,
            ConversationUserState.active_event_id.in_(ids),
        )
    )
    for st in st_r.scalars().all():
        st.active_event_id = root_id
    conv_r = await session.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_r.scalar_one_or_none()
    if conv is not None:
        conv.updated_at = now
    await _set_needs_context_rebuild_all_members(session, conversation_id)
    await session.flush()
    return SoftDeleteSubtreeResult(len(ids), group_id)


async def _restore_soft_deleted_graph_by_deletion_group(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    deletion_group_id: uuid.UUID,
) -> int:
    """Clear soft-delete on all events in ``deletion_group_id`` and matching ``conversations`` batch row."""
    res = await session.execute(
        select(Event.id).where(
            Event.conversation_id == conversation_id,
            Event.deletion_group_id == deletion_group_id,
            Event.deleted_at.isnot(None),
        )
    )
    ids = [row[0] for row in res.all()]
    if not ids:
        return 0
    now = datetime.now(tz=UTC)
    await session.execute(
        update(Event)
        .where(Event.id.in_(ids))
        .values(
            deleted_at=None,
            deletion_group_id=None,
            deleted_by_user_id=None,
            updated_at=now,
        )
    )
    await session.execute(
        update(Conversation)
        .where(
            Conversation.id == conversation_id,
            Conversation.deletion_group_id == deletion_group_id,
        )
        .values(
            deleted_at=None,
            deletion_group_id=None,
            deleted_by_user_id=None,
            updated_at=now,
        )
    )
    await _set_needs_context_rebuild_all_members(session, conversation_id)
    await session.flush()
    return len(ids)


async def undo_soft_delete_by_deletion_group(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    deletion_group_id: uuid.UUID,
    *,
    undo_window: timedelta,
) -> int:
    """Clear soft-delete for all events in ``deletion_group_id`` if the caller deleted them within ``undo_window``."""
    member = await get_conversation_member(session, conversation_id, user_id)
    if member is None:
        raise PermissionError("not a member")
    cutoff = datetime.now(tz=UTC) - undo_window
    res = await session.execute(
        select(Event.id).where(
            Event.conversation_id == conversation_id,
            Event.deletion_group_id == deletion_group_id,
            Event.deleted_by_user_id == user_id,
            Event.deleted_at.isnot(None),
            Event.deleted_at >= cutoff,
        )
    )
    ids = [row[0] for row in res.all()]
    if not ids:
        raise LookupError("deletion group not found or undo window expired")
    now = datetime.now(tz=UTC)
    await session.execute(
        update(Event)
        .where(Event.id.in_(ids))
        .values(
            deleted_at=None,
            deletion_group_id=None,
            deleted_by_user_id=None,
            updated_at=now,
        )
    )
    await session.execute(
        update(Conversation)
        .where(
            Conversation.id == conversation_id,
            Conversation.deletion_group_id == deletion_group_id,
        )
        .values(
            deleted_at=None,
            deletion_group_id=None,
            deleted_by_user_id=None,
            updated_at=now,
        )
    )
    conv_r = await session.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_r.scalar_one_or_none()
    if conv is not None:
        conv.updated_at = now
    await _set_needs_context_rebuild_all_members(session, conversation_id)
    await session.flush()
    return len(ids)


async def restore_soft_deleted_subtree(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    event_id: uuid.UUID,
) -> int:
    """Clear soft-delete for all events sharing the anchor row’s ``deletion_group_id``."""
    member = await get_conversation_member(session, conversation_id, user_id)
    if member is None:
        raise PermissionError("not a member")
    if member.role == "viewer":
        raise PermissionError("viewers cannot restore graph subtrees")
    anchor = await load_event_row_any_status(session, conversation_id, event_id)
    if anchor is None:
        raise LookupError("event not found")
    if anchor.deleted_at is None:
        raise ValueError("event is not soft-deleted")
    if anchor.visible_to is not None and anchor.visible_to != user_id:
        raise PermissionError("event not visible")
    if anchor.deletion_group_id is None:
        raise ValueError("subtree has no deletion_group_id; cannot restore")
    return await _restore_soft_deleted_graph_by_deletion_group(
        session, conversation_id, anchor.deletion_group_id
    )


async def restore_soft_deleted_conversation_graph(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
) -> int:
    """Clear owner soft-delete for the whole conversation graph (same ``deletion_group_id`` on all rows)."""
    member = await get_conversation_member(session, conversation_id, user_id)
    if member is None:
        raise PermissionError("not a member")
    if member.role == "viewer":
        raise PermissionError("viewers cannot restore deleted conversations")
    res = await session.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = res.scalar_one_or_none()
    if conv is None:
        raise LookupError("conversation not found")
    if conv.deleted_at is None:
        raise ValueError("conversation is not deleted")
    if conv.deletion_group_id is None:
        raise ValueError("conversation has no deletion_group_id; cannot restore")
    return await _restore_soft_deleted_graph_by_deletion_group(
        session, conversation_id, conv.deletion_group_id
    )


async def read_conversation_caller_state(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ConversationUserState:
    """Return the caller’s ``conversation_user_state`` row, or a **non-persisted** default rooted at the graph root."""
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    st_r = await session.execute(
        select(ConversationUserState).where(
            ConversationUserState.conversation_id == conversation_id,
            ConversationUserState.user_id == user_id,
        )
    )
    st = st_r.scalar_one_or_none()
    if st is not None:
        return st
    root_id = await _conversation_root_event_id(session, conversation_id)
    now = datetime.now(tz=UTC)
    return ConversationUserState(
        conversation_id=conversation_id,
        user_id=user_id,
        active_event_id=root_id,
        last_seen_at=now,
        needs_context_rebuild=False,
    )


async def set_conversation_active_event(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    active_event_id: uuid.UUID,
    needs_context_rebuild: bool = False,
) -> ConversationUserState:
    """Update ``conversation_user_state.active_event_id`` for the caller (permissions matrix)."""
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    ev = await load_event(session, conversation_id, active_event_id)
    if ev is None:
        raise ValueError("active_event_id not found in this conversation")
    if ev.visible_to is not None and ev.visible_to != user_id:
        raise ValueError("active_event_id is not visible to the caller")
    now = datetime.now(tz=UTC)
    st_r = await session.execute(
        select(ConversationUserState).where(
            ConversationUserState.conversation_id == conversation_id,
            ConversationUserState.user_id == user_id,
        )
    )
    st = st_r.scalar_one_or_none()
    if st is None:
        st = ConversationUserState(
            conversation_id=conversation_id,
            user_id=user_id,
            active_event_id=active_event_id,
            last_seen_at=now,
            needs_context_rebuild=needs_context_rebuild,
        )
        session.add(st)
    else:
        st.active_event_id = active_event_id
        st.needs_context_rebuild = needs_context_rebuild
        st.last_seen_at = now
    await session.flush()
    await session.refresh(st)
    return st


async def append_graph_event(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    kind: str,
    parent_event_id: uuid.UUID,
    content: str,
    private_branch: bool,
    content_json: dict | None = None,
    checkpoint_label: str | None = None,
) -> Event:
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    parent = await load_event_row_any_status(session, conversation_id, parent_event_id)
    if parent is None:
        raise LookupError("parent_event_not_found")
    if parent.visible_to is not None and parent.visible_to != user_id:
        raise PermissionError("event not visible")
    inherited_deleted_at = parent.deleted_at
    inherited_deletion_group_id = parent.deletion_group_id if inherited_deleted_at is not None else None
    inherited_deleted_by_user_id = parent.deleted_by_user_id if inherited_deleted_at is not None else None
    now = datetime.now(tz=UTC)
    if kind == "assistant_output":
        if parent.kind != "user_input":
            raise ValueError("assistant_output must attach to user_input")
        # Inherit private draft scope so assistant replies stay user-only with the user line
        # (shared children can still attach under private nodes via separate user_input rows).
        visible_to = parent.visible_to
        actor_type = "assistant"
        actor_user_id = None
        final_text = content
        final_json = content_json
    else:
        visible_to = user_id if private_branch else None
        actor_type = "user"
        actor_user_id = user_id
        text_norm = (content or "").replace("\r\n", "\n").replace("\r", "\n").strip()
        norm_cj: dict | None = None
        if content_json is not None:
            from colcoor_backend.services.conversation_images import normalize_user_media_content_json

            norm_cj = await normalize_user_media_content_json(
                session,
                conversation_id=conversation_id,
                content_json=content_json,
            )
        if not text_norm and not norm_cj:
            raise ValueError("user_input requires non-empty text and/or colcoor_user_media images")
        final_text = text_norm
        final_json = norm_cj
    ev = Event(
        conversation_id=conversation_id,
        parent_event_id=parent_event_id,
        kind=kind,
        actor_type=actor_type,
        actor_user_id=actor_user_id,
        content_text=final_text,
        content_json=final_json,
        checkpoint_label=checkpoint_label,
        visible_to=visible_to,
        deleted_at=inherited_deleted_at,
        deletion_group_id=inherited_deletion_group_id,
        deleted_by_user_id=inherited_deleted_by_user_id,
        created_at=now,
        updated_at=now,
    )
    session.add(ev)
    # Server-generated Event.id; flush before FK on conversation_user_state.active_event_id.
    await session.flush()
    conv_r = await session.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_r.scalar_one()
    conv.updated_at = now
    if inherited_deleted_at is None:
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
        .where(ConversationMember.user_id == user_id, Conversation.deleted_at.is_(None))
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
    await require_live_conversation(session, conversation_id)
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


async def soft_delete_conversation_for_owner(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
) -> SoftDeleteSubtreeResult:
    """Soft-delete every live graph event and mark the conversation deleted. **Owner only**."""
    member = await get_conversation_member(session, conversation_id, user_id)
    if member is None:
        raise LookupError("conversation not found")
    if member.role != "owner":
        raise PermissionError("only the conversation owner can delete it")
    conv_r = await session.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_r.scalar_one_or_none()
    if conv is None:
        raise LookupError("conversation not found")
    if conv.deleted_at is not None:
        return SoftDeleteSubtreeResult(0, None)
    ev_res = await session.execute(
        select(Event.id).where(
            Event.conversation_id == conversation_id,
            Event.deleted_at.is_(None),
        )
    )
    ids = [row[0] for row in ev_res.all()]
    if not ids:
        return SoftDeleteSubtreeResult(0, None)
    root_id = await _conversation_graph_root_event_id(session, conversation_id)
    now = datetime.now(tz=UTC)
    group_id = uuid.uuid4()
    await session.execute(
        update(Event)
        .where(Event.id.in_(ids))
        .values(
            deleted_at=now,
            updated_at=now,
            deletion_group_id=group_id,
            deleted_by_user_id=user_id,
        )
    )
    await session.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(
            deleted_at=now,
            deletion_group_id=group_id,
            deleted_by_user_id=user_id,
            updated_at=now,
        )
    )
    await session.execute(delete(EventStar).where(EventStar.event_id.in_(ids)))
    st_r = await session.execute(
        select(ConversationUserState).where(
            ConversationUserState.conversation_id == conversation_id,
            ConversationUserState.active_event_id.in_(ids),
        )
    )
    for st in st_r.scalars().all():
        st.active_event_id = root_id
    await _set_needs_context_rebuild_all_members(session, conversation_id)
    await session.flush()
    return SoftDeleteSubtreeResult(len(ids), group_id)


async def list_conversation_members(
    session: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> list[tuple[uuid.UUID, str, str, str, str | None]]:
    """Return ``(user_id, role, email, display_name, handle)`` for each member; caller must be a member."""
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    stmt = (
        select(
            ConversationMember.user_id,
            ConversationMember.role,
            User.email,
            User.display_name,
            User.handle,
        )
        .join(User, User.id == ConversationMember.user_id)
        .where(ConversationMember.conversation_id == conversation_id)
        .order_by(User.email.asc())
    )
    res = await session.execute(stmt)
    return [(r[0], r[1], r[2], r[3], r[4]) for r in res.all()]


async def list_events_for_tree(
    session: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> list[Event]:
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
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


async def tree_event_annotations(
    session: AsyncSession,
    event_ids: list[uuid.UUID],
    user_id: uuid.UUID,
) -> tuple[set[uuid.UUID], dict[uuid.UUID, int]]:
    """Starred event ids for this user, and note counts per event, for tree UI ([tree-ui-contract.md])."""
    if not event_ids:
        return set(), {}
    res_star = await session.execute(
        select(EventStar.event_id).where(
            EventStar.user_id == user_id,
            EventStar.event_id.in_(event_ids),
        )
    )
    starred = {row[0] for row in res_star.all()}
    res_notes = await session.execute(
        select(Note.event_id, func.count(Note.id))
        .where(Note.event_id.in_(event_ids))
        .group_by(Note.event_id)
    )
    note_counts = {row[0]: int(row[1]) for row in res_notes.all()}
    return starred, note_counts


async def _set_needs_context_rebuild_all_members(
    session: AsyncSession, conversation_id: uuid.UUID
) -> None:
    """After note add/edit/delete on a shared-visible graph ([domain-model.md] §4)."""
    await session.execute(
        update(ConversationUserState)
        .where(ConversationUserState.conversation_id == conversation_id)
        .values(needs_context_rebuild=True)
    )


async def list_notes_visible(
    session: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> list[Note]:
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    stmt = (
        select(Note)
        .join(Event, Event.id == Note.event_id)
        .where(
            Event.conversation_id == conversation_id,
            Event.deleted_at.is_(None),
            or_(Event.visible_to.is_(None), Event.visible_to == user_id),
        )
        .order_by(Note.created_at.asc(), Note.id.asc())
    )
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def load_note_in_conversation(
    session: AsyncSession, conversation_id: uuid.UUID, note_id: uuid.UUID
) -> tuple[Note, Event] | None:
    res = await session.execute(
        select(Note, Event)
        .join(Event, Event.id == Note.event_id)
        .where(
            Note.id == note_id,
            Event.conversation_id == conversation_id,
            Event.deleted_at.is_(None),
        )
    )
    row = res.one_or_none()
    if row is None:
        return None
    return row[0], row[1]


async def create_note_on_event(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    event_id: uuid.UUID,
    content: str,
) -> Note:
    member = await get_conversation_member(session, conversation_id, user_id)
    if member is None:
        raise PermissionError("not a member")
    await require_live_conversation(session, conversation_id)
    if member.role == "viewer":
        raise PermissionError("viewers cannot add notes")
    ev = await load_event(session, conversation_id, event_id)
    if ev is None:
        raise LookupError("event not found")
    if ev.visible_to is not None and ev.visible_to != user_id:
        raise PermissionError("event not visible")
    text = content.strip()
    if not text:
        raise ValueError("content required")
    now = datetime.now(tz=UTC)
    note = Note(
        event_id=event_id,
        author_user_id=user_id,
        content=text,
        created_at=now,
        updated_at=now,
    )
    session.add(note)
    await session.flush()
    await _set_needs_context_rebuild_all_members(session, conversation_id)
    await session.refresh(note)
    return note


async def update_note_content(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    note_id: uuid.UUID,
    content: str,
) -> Note:
    member = await get_conversation_member(session, conversation_id, user_id)
    if member is None:
        raise PermissionError("not a member")
    await require_live_conversation(session, conversation_id)
    if member.role == "viewer":
        raise PermissionError("viewers cannot edit notes")
    loaded = await load_note_in_conversation(session, conversation_id, note_id)
    if loaded is None:
        raise LookupError("note not found")
    note, ev = loaded
    if ev.visible_to is not None and ev.visible_to != user_id:
        raise PermissionError("event not visible")
    text = content.strip()
    if not text:
        raise ValueError("content required")
    note.content = text
    note.updated_at = datetime.now(tz=UTC)
    await session.flush()
    await _set_needs_context_rebuild_all_members(session, conversation_id)
    await session.refresh(note)
    return note


async def delete_note_row(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    note_id: uuid.UUID,
) -> None:
    member = await get_conversation_member(session, conversation_id, user_id)
    if member is None:
        raise PermissionError("not a member")
    await require_live_conversation(session, conversation_id)
    if member.role == "viewer":
        raise PermissionError("viewers cannot delete notes")
    loaded = await load_note_in_conversation(session, conversation_id, note_id)
    if loaded is None:
        raise LookupError("note not found")
    note, ev = loaded
    if ev.visible_to is not None and ev.visible_to != user_id:
        raise PermissionError("event not visible")
    await session.delete(note)
    await session.flush()
    await _set_needs_context_rebuild_all_members(session, conversation_id)


async def patch_event_checkpoint_label(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    event_id: uuid.UUID,
    checkpoint_label: str | None,
) -> Event:
    """Set or clear ``events.checkpoint_label`` (display-only message title). Owner/editor only."""
    member = await get_conversation_member(session, conversation_id, user_id)
    if member is None:
        raise PermissionError("not a member")
    await require_live_conversation(session, conversation_id)
    if member.role == "viewer":
        raise PermissionError("viewers cannot edit message titles")
    ev = await load_event(session, conversation_id, event_id)
    if ev is None:
        raise LookupError("event not found")
    if ev.visible_to is not None and ev.visible_to != user_id:
        raise PermissionError("event not visible")
    if ev.kind not in ("user_input", "assistant_output"):
        raise ValueError("only user_input and assistant_output support titles")
    now = datetime.now(tz=UTC)
    if checkpoint_label is None:
        normalized: str | None = None
    else:
        t = checkpoint_label.replace("\r\n", "\n").replace("\r", "\n").strip()
        normalized = t[:256] if t else None
    ev.checkpoint_label = normalized
    ev.updated_at = now
    conv_r = await session.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_r.scalar_one()
    conv.updated_at = now
    await session.flush()
    await session.refresh(ev)
    return ev


async def put_event_star(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    event_id: uuid.UUID,
) -> None:
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    ev = await load_event(session, conversation_id, event_id)
    if ev is None:
        raise LookupError("event not found")
    if ev.visible_to is not None and ev.visible_to != user_id:
        raise PermissionError("event not visible")
    res = await session.execute(
        select(EventStar).where(EventStar.user_id == user_id, EventStar.event_id == event_id)
    )
    if res.scalar_one_or_none() is None:
        session.add(EventStar(user_id=user_id, event_id=event_id))
        await session.flush()


async def delete_event_star(
    session: AsyncSession,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    event_id: uuid.UUID,
) -> None:
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    ev = await load_event(session, conversation_id, event_id)
    if ev is None:
        raise LookupError("event not found")
    if ev.visible_to is not None and ev.visible_to != user_id:
        raise PermissionError("event not visible")
    await session.execute(
        delete(EventStar).where(EventStar.user_id == user_id, EventStar.event_id == event_id)
    )
    await session.flush()


async def _conversation_graph_root_event_id(session: AsyncSession, conversation_id: uuid.UUID) -> uuid.UUID:
    """The tree root row (``parent_event_id IS NULL``), including when it is soft-deleted."""
    res = await session.execute(
        select(Event.id).where(
            Event.conversation_id == conversation_id,
            Event.parent_event_id.is_(None),
        )
    )
    rid = res.scalar_one_or_none()
    if rid is None:
        raise LookupError("no root event for conversation")
    return rid


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
        raise LookupError("no root event for conversation")
    return rid


async def add_conversation_member(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    new_user_id: uuid.UUID,
    role: str,
) -> tuple[uuid.UUID, str, str, str, str | None]:
    """Add ``new_user_id`` as ``editor`` or ``viewer``; **owner or editor** may invite ([permissions.md])."""
    actor = await get_conversation_member(session, conversation_id, actor_user_id)
    if actor is None:
        raise LookupError("conversation not found")
    if actor.role not in ("owner", "editor"):
        raise PermissionError("forbidden")
    await require_live_conversation(session, conversation_id)
    if role not in ("editor", "viewer"):
        raise ValueError("role must be editor or viewer")
    res_u = await session.execute(select(User).where(User.id == new_user_id))
    if res_u.scalar_one_or_none() is None:
        raise LookupError("user not found")
    if await get_conversation_member(session, conversation_id, new_user_id) is not None:
        raise ValueError("already a member")
    now = datetime.now(tz=UTC)
    root_id = await _conversation_root_event_id(session, conversation_id)
    session.add(
        ConversationMember(
            conversation_id=conversation_id,
            user_id=new_user_id,
            role=role,
            pinned=False,
        )
    )
    session.add(
        ConversationUserState(
            conversation_id=conversation_id,
            user_id=new_user_id,
            active_event_id=root_id,
            last_seen_at=now,
            needs_context_rebuild=False,
        )
    )
    await session.flush()
    res_row = await session.execute(select(User.email, User.display_name, User.handle).where(User.id == new_user_id))
    em, dn, hn = res_row.one()
    return (new_user_id, role, em, dn or "", hn)


_MEMBER_INVITE_SEARCH_QUERY_MAX = 320
# Handles stored in `users.handle` (public @handle); used for invite lookup only.
_MEMBER_INVITE_HANDLE_RE = re.compile(r"^[a-zA-Z0-9_.-]{1,200}$")


def _not_already_member_subquery(conversation_id: uuid.UUID):
    return select(ConversationMember.user_id).where(ConversationMember.conversation_id == conversation_id)


async def search_conversation_member_invite_candidates(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    query: str,
) -> list[tuple[uuid.UUID, str, str, str | None, str | None, datetime]]:
    """Match existing users by UUID, full email (case-insensitive), or handle (case-insensitive, optional ``@``).

    **Owner or editor** only (same gate as :func:`add_conversation_member`). Excludes users who are
    already members. Returns rows as ``(user_id, email, display_name, handle, avatar_url, last_login_at)``.
    """
    actor = await get_conversation_member(session, conversation_id, actor_user_id)
    if actor is None:
        raise LookupError("conversation not found")
    if actor.role not in ("owner", "editor"):
        raise PermissionError("forbidden")
    await require_live_conversation(session, conversation_id)

    q = (query or "").strip()
    if not q or len(q) > _MEMBER_INVITE_SEARCH_QUERY_MAX:
        raise ValueError("invalid query")

    not_member = ~User.id.in_(_not_already_member_subquery(conversation_id))

    users: list[User] = []
    try:
        parsed_uid = uuid.UUID(q)
    except ValueError:
        parsed_uid = None

    if parsed_uid is not None:
        res = await session.execute(select(User).where(User.id == parsed_uid, not_member))
        users = list(res.scalars().all())
    elif "@" in q:
        email_lower = q.lower()
        res = await session.execute(
            select(User).where(not_member, func.lower(User.email) == email_lower).order_by(User.last_login_at.desc())
        )
        users = list(res.scalars().all())
    else:
        handle_part = q[1:].strip() if q.startswith("@") else q
        if not handle_part or not _MEMBER_INVITE_HANDLE_RE.match(handle_part):
            raise ValueError("invalid handle (use letters, digits, ._- or an email address)")
        hl = handle_part.lower()
        res = await session.execute(
            select(User).where(not_member, User.handle.is_not(None), func.lower(User.handle) == hl).order_by(
                User.last_login_at.desc()
            )
        )
        users = list(res.scalars().all())

    out: list[tuple[uuid.UUID, str, str, str | None, str | None, datetime]] = []
    for u in users:
        out.append(
            (
                u.id,
                u.email,
                u.display_name or "",
                u.handle,
                u.avatar_url,
                u.last_login_at,
            )
        )
    return out


async def update_conversation_member_role(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    target_user_id: uuid.UUID,
    new_role: str,
) -> tuple[uuid.UUID, str, str, str, str | None]:
    """Change a member's role; **owner only**. Promoting to ``owner`` demotes the previous owner to ``editor``."""
    actor = await get_conversation_member(session, conversation_id, actor_user_id)
    if actor is None:
        raise LookupError("conversation not found")
    if actor.role != "owner":
        raise PermissionError("forbidden")
    if new_role not in ("owner", "editor", "viewer"):
        raise ValueError("invalid role")
    target = await get_conversation_member(session, conversation_id, target_user_id)
    if target is None:
        raise LookupError("member not found")
    if target.role == "owner" and new_role != "owner":
        raise PermissionError("cannot demote the sole conversation owner")
    await require_live_conversation(session, conversation_id)
    if new_role == "owner":
        await session.execute(
            update(ConversationMember)
            .where(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.role == "owner",
                ConversationMember.user_id != target_user_id,
            )
            .values(role="editor")
        )
    target.role = new_role
    await session.flush()
    res_row = await session.execute(select(User.email, User.display_name, User.handle).where(User.id == target_user_id))
    em, dn, hn = res_row.one()
    return (target_user_id, new_role, em, dn or "", hn)


async def remove_conversation_member(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    target_user_id: uuid.UUID,
) -> None:
    """Remove a non-owner member; **owner only**."""
    actor = await get_conversation_member(session, conversation_id, actor_user_id)
    if actor is None:
        raise LookupError("conversation not found")
    if actor.role != "owner":
        raise PermissionError("forbidden")
    await require_live_conversation(session, conversation_id)
    target = await get_conversation_member(session, conversation_id, target_user_id)
    if target is None:
        raise LookupError("member not found")
    if target.role == "owner":
        raise PermissionError("cannot remove the conversation owner")
    await session.execute(
        delete(ConversationUserState).where(
            ConversationUserState.conversation_id == conversation_id,
            ConversationUserState.user_id == target_user_id,
        )
    )
    await session.execute(
        delete(EventStar).where(
            EventStar.user_id == target_user_id,
            EventStar.event_id.in_(
                select(Event.id).where(
                    Event.conversation_id == conversation_id,
                    Event.deleted_at.is_(None),
                )
            ),
        )
    )
    await session.delete(target)
    await session.flush()
