"""Private per-conversation Lists and selected-text items."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from colcoor_backend.db.models import ConversationList, ConversationListItem
from colcoor_backend.services.graph import (
    ensure_conversation_member,
    load_event,
    require_live_conversation,
)

LIST_NAME_MAX = 120
LIST_DESCRIPTION_MAX = 1000
LIST_SELECTED_TEXT_MAX = 10_000

DEFAULT_LIST_COLORS = (
    "#f59e0b",
    "#10b981",
    "#3b82f6",
    "#a855f7",
    "#ef4444",
    "#14b8a6",
    "#f97316",
    "#84cc16",
)


def _normalize_name(name: str) -> str:
    text = (name or "").strip()
    if not text:
        raise ValueError("List name required")
    if len(text) > LIST_NAME_MAX:
        raise ValueError(f"List name must be at most {LIST_NAME_MAX} characters")
    return text


def _normalize_description(description: str | None) -> str | None:
    if description is None:
        return None
    text = description.strip()
    if not text:
        return None
    if len(text) > LIST_DESCRIPTION_MAX:
        raise ValueError(f"List description must be at most {LIST_DESCRIPTION_MAX} characters")
    return text


def _normalize_color(color: str | None, sort_order: int) -> str:
    text = (color or "").strip()
    if not text:
        return DEFAULT_LIST_COLORS[sort_order % len(DEFAULT_LIST_COLORS)]
    if len(text) > 64:
        raise ValueError("List color is too long")
    return text


def _normalize_selected_text(selected_text: str) -> str:
    text = (selected_text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        raise ValueError("selected_text required")
    if len(text) > LIST_SELECTED_TEXT_MAX:
        raise ValueError(f"selected_text must be at most {LIST_SELECTED_TEXT_MAX} characters")
    return text


async def _assert_unique_list_name(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    name: str,
    ignore_list_id: uuid.UUID | None = None,
) -> None:
    stmt = select(ConversationList.id).where(
        ConversationList.conversation_id == conversation_id,
        ConversationList.owner_user_id == user_id,
        func.lower(ConversationList.name) == name.lower(),
    )
    if ignore_list_id is not None:
        stmt = stmt.where(ConversationList.id != ignore_list_id)
    res = await session.execute(stmt.limit(1))
    if res.scalar_one_or_none() is not None:
        raise ValueError("List name already exists")


async def _load_owned_list(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    list_id: uuid.UUID,
) -> ConversationList:
    res = await session.execute(
        select(ConversationList).where(
            ConversationList.id == list_id,
            ConversationList.conversation_id == conversation_id,
            ConversationList.owner_user_id == user_id,
        )
    )
    row = res.scalar_one_or_none()
    if row is None:
        raise LookupError("List not found")
    return row


async def _load_owned_item(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    list_id: uuid.UUID,
    item_id: uuid.UUID,
) -> ConversationListItem:
    res = await session.execute(
        select(ConversationListItem).where(
            ConversationListItem.id == item_id,
            ConversationListItem.list_id == list_id,
            ConversationListItem.conversation_id == conversation_id,
            ConversationListItem.owner_user_id == user_id,
        )
    )
    row = res.scalar_one_or_none()
    if row is None:
        raise LookupError("List item not found")
    return row


async def list_lists(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    include_items: bool = True,
) -> tuple[list[ConversationList], list[ConversationListItem], dict[uuid.UUID, int]]:
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    lists_res = await session.execute(
        select(ConversationList)
        .where(
            ConversationList.conversation_id == conversation_id,
            ConversationList.owner_user_id == user_id,
        )
        .order_by(ConversationList.sort_order.asc(), ConversationList.created_at.asc(), ConversationList.id.asc())
    )
    lists = list(lists_res.scalars().all())
    if not lists:
        return [], [], {}
    list_ids = [row.id for row in lists]
    counts_res = await session.execute(
        select(ConversationListItem.list_id, func.count(ConversationListItem.id))
        .where(ConversationListItem.list_id.in_(list_ids))
        .group_by(ConversationListItem.list_id)
    )
    counts = {row[0]: int(row[1]) for row in counts_res.all()}
    items: list[ConversationListItem] = []
    if include_items:
        items_res = await session.execute(
            select(ConversationListItem)
            .where(
                ConversationListItem.conversation_id == conversation_id,
                ConversationListItem.owner_user_id == user_id,
            )
            .order_by(ConversationListItem.created_at.desc(), ConversationListItem.id.desc())
        )
        items = list(items_res.scalars().all())
    return lists, items, counts


async def create_list(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    name: str,
    description: str | None = None,
    color: str | None = None,
    sort_order: int | None = None,
    metadata_json: dict | None = None,
) -> ConversationList:
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    normalized = _normalize_name(name)
    await _assert_unique_list_name(
        session,
        conversation_id=conversation_id,
        user_id=user_id,
        name=normalized,
    )
    if sort_order is None:
        res = await session.execute(
            select(func.coalesce(func.max(ConversationList.sort_order), -1)).where(
                ConversationList.conversation_id == conversation_id,
                ConversationList.owner_user_id == user_id,
            )
        )
        sort_order = int(res.scalar_one() or -1) + 1
    row = ConversationList(
        conversation_id=conversation_id,
        owner_user_id=user_id,
        name=normalized,
        description=_normalize_description(description),
        color=_normalize_color(color, sort_order),
        sort_order=sort_order,
        metadata_json=metadata_json or {},
    )
    session.add(row)
    await session.flush()
    await session.refresh(row)
    return row


async def update_list(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    list_id: uuid.UUID,
    patch: dict[str, object],
) -> ConversationList:
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    row = await _load_owned_list(
        session,
        conversation_id=conversation_id,
        user_id=user_id,
        list_id=list_id,
    )
    if "name" in patch:
        name = _normalize_name(str(patch["name"]))
        await _assert_unique_list_name(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            name=name,
            ignore_list_id=list_id,
        )
        row.name = name
    if "description" in patch:
        raw = patch["description"]
        row.description = _normalize_description(None if raw is None else str(raw))
    if "color" in patch:
        raw = patch["color"]
        row.color = _normalize_color(None if raw is None else str(raw), row.sort_order)
    if "sort_order" in patch and patch["sort_order"] is not None:
        row.sort_order = int(patch["sort_order"])
    if "metadata_json" in patch:
        metadata_json = patch["metadata_json"]
        if metadata_json is not None and not isinstance(metadata_json, dict):
            raise ValueError("metadata_json must be an object or null")
        row.metadata_json = metadata_json or {}
    row.updated_at = datetime.now(tz=UTC)
    await session.flush()
    await session.refresh(row)
    return row


async def delete_list(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    list_id: uuid.UUID,
) -> None:
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    row = await _load_owned_list(
        session,
        conversation_id=conversation_id,
        user_id=user_id,
        list_id=list_id,
    )
    await session.delete(row)
    await session.flush()


async def reorder_lists(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    list_ids: list[uuid.UUID],
) -> list[ConversationList]:
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    if len(set(list_ids)) != len(list_ids):
        raise ValueError("List ids must be unique")
    rows, _, _ = await list_lists(
        session,
        conversation_id=conversation_id,
        user_id=user_id,
        include_items=False,
    )
    existing = {row.id for row in rows}
    if existing != set(list_ids):
        raise ValueError("List ids must include every List exactly once")
    now = datetime.now(tz=UTC)
    for idx, lid in enumerate(list_ids):
        await session.execute(
            update(ConversationList)
            .where(
                ConversationList.id == lid,
                ConversationList.conversation_id == conversation_id,
                ConversationList.owner_user_id == user_id,
            )
            .values(sort_order=idx, updated_at=now)
        )
    await session.flush()
    rows, _, _ = await list_lists(
        session,
        conversation_id=conversation_id,
        user_id=user_id,
        include_items=False,
    )
    return rows


async def list_list_items(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    list_id: uuid.UUID,
    q: str | None = None,
    limit: int | None = None,
) -> list[ConversationListItem]:
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    await _load_owned_list(
        session,
        conversation_id=conversation_id,
        user_id=user_id,
        list_id=list_id,
    )
    stmt = select(ConversationListItem).where(
        ConversationListItem.conversation_id == conversation_id,
        ConversationListItem.owner_user_id == user_id,
        ConversationListItem.list_id == list_id,
    )
    needle = (q or "").strip()
    if needle:
        stmt = stmt.where(ConversationListItem.selected_text.ilike(f"%{needle}%"))
    stmt = stmt.order_by(ConversationListItem.created_at.desc(), ConversationListItem.id.desc())
    if limit is not None:
        stmt = stmt.limit(limit)
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def create_list_item(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    list_id: uuid.UUID,
    event_id: uuid.UUID,
    selected_text: str,
    anchor_json: dict,
    source_content_hash: str | None = None,
    sort_order: int | None = None,
    metadata_json: dict | None = None,
) -> ConversationListItem:
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    await _load_owned_list(
        session,
        conversation_id=conversation_id,
        user_id=user_id,
        list_id=list_id,
    )
    ev = await load_event(session, conversation_id, event_id)
    if ev is None:
        raise LookupError("event not found")
    if ev.visible_to is not None and ev.visible_to != user_id:
        raise PermissionError("event not visible")
    if not isinstance(anchor_json, dict):
        raise ValueError("anchor_json must be an object")
    row = ConversationListItem(
        list_id=list_id,
        conversation_id=conversation_id,
        owner_user_id=user_id,
        event_id=event_id,
        selected_text=_normalize_selected_text(selected_text),
        anchor_json=anchor_json,
        source_content_hash=(source_content_hash or "").strip() or None,
        sort_order=sort_order,
        metadata_json=metadata_json or {},
    )
    session.add(row)
    await session.flush()
    await session.refresh(row)
    return row


async def update_list_item(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    list_id: uuid.UUID,
    item_id: uuid.UUID,
    patch: dict[str, object],
) -> ConversationListItem:
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    row = await _load_owned_item(
        session,
        conversation_id=conversation_id,
        user_id=user_id,
        list_id=list_id,
        item_id=item_id,
    )
    if "list_id" in patch and patch["list_id"] is not None:
        new_list_id = patch["list_id"]
        if not isinstance(new_list_id, uuid.UUID):
            raise ValueError("list_id must be a UUID")
        await _load_owned_list(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            list_id=new_list_id,
        )
        row.list_id = new_list_id
    if "sort_order" in patch:
        raw = patch["sort_order"]
        row.sort_order = None if raw is None else int(raw)
    if "metadata_json" in patch:
        metadata_json = patch["metadata_json"]
        if metadata_json is not None and not isinstance(metadata_json, dict):
            raise ValueError("metadata_json must be an object or null")
        row.metadata_json = metadata_json or {}
    await session.flush()
    await session.refresh(row)
    return row


async def delete_list_item(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    list_id: uuid.UUID,
    item_id: uuid.UUID,
) -> None:
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    await _load_owned_item(
        session,
        conversation_id=conversation_id,
        user_id=user_id,
        list_id=list_id,
        item_id=item_id,
    )
    await session.execute(
        delete(ConversationListItem).where(
            ConversationListItem.id == item_id,
            ConversationListItem.list_id == list_id,
            ConversationListItem.conversation_id == conversation_id,
            ConversationListItem.owner_user_id == user_id,
        )
    )
    await session.flush()
