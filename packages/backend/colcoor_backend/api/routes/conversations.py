from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from colcoor_backend.api.deps import CurrentUserId, DbSession
from colcoor_backend.db.models import Conversation, ConversationMember
from colcoor_backend.api.schemas import (
    AppendEventBody,
    ConversationCreate,
    ConversationOut,
    ConversationPatch,
    EventKind,
    EventNodeOut,
    TreeResponse,
)
from colcoor_backend.services.graph import (
    append_graph_event,
    create_conversation_with_owner,
    list_conversations_for_user,
    list_events_for_tree,
    patch_conversation_for_user,
)

router = APIRouter()


def _conversation_out(conv: Conversation, member: ConversationMember) -> ConversationOut:
    return ConversationOut(
        id=conv.id,
        title=conv.title,
        pinned=member.pinned,
        updated_at=conv.updated_at,
    )


@router.get("", response_model=list[ConversationOut])
async def list_conversations(
    session: DbSession,
    user_id: CurrentUserId,
) -> list[ConversationOut]:
    rows = await list_conversations_for_user(session, user_id)
    return [_conversation_out(c, m) for c, m in rows]


@router.post("", response_model=ConversationOut)
async def create_conversation(
    session: DbSession,
    user_id: CurrentUserId,
    body: ConversationCreate,
) -> ConversationOut:
    conv, member = await create_conversation_with_owner(session, user_id=user_id, title=body.title)
    await session.commit()
    return _conversation_out(conv, member)


@router.patch("/{conversation_id}", response_model=ConversationOut)
async def patch_conversation(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    body: ConversationPatch,
) -> ConversationOut:
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="at least one of title, pinned required",
        )
    try:
        row = await patch_conversation_for_user(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            patch=patch,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    conv, member = row
    await session.commit()
    return _conversation_out(conv, member)


@router.post("/{conversation_id}/append-event")
async def append_event(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    body: AppendEventBody,
) -> dict[str, str]:
    if body.kind == EventKind.assistant_output and body.private_branch:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="private_branch applies to user_input only",
        )
    try:
        ev = await append_graph_event(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            kind=body.kind.value,
            parent_event_id=body.parent_event_id,
            content=body.content,
            private_branch=body.private_branch,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="parent_event not found",
        ) from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from None
    await session.commit()
    return {"id": str(ev.id)}


@router.get("/{conversation_id}/tree", response_model=TreeResponse)
async def get_tree(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
) -> TreeResponse:
    try:
        events = await list_events_for_tree(session, conversation_id, user_id)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    return TreeResponse(events=[EventNodeOut.model_validate(e) for e in events])
