from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status

from colcoor_backend.api.deps import CurrentUserId, DbSession
from colcoor_backend.db.models import Conversation, ConversationMember
from colcoor_backend.api.schemas import (
    AppendEventBody,
    ConversationCreate,
    ConversationOut,
    ConversationPatch,
    ConversationUserStateOut,
    EventKind,
    EventNodeOut,
    MemberOut,
    NoteCreateBody,
    NoteOut,
    NotePatchBody,
    SetActiveBody,
    TreeResponse,
)
from colcoor_backend.services.graph import (
    append_graph_event,
    create_conversation_with_owner,
    create_note_on_event,
    delete_conversation_for_owner,
    delete_event_star,
    delete_note_row,
    list_conversation_members,
    list_conversations_for_user,
    list_events_for_tree,
    list_notes_visible,
    patch_conversation_for_user,
    put_event_star,
    set_conversation_active_event,
    tree_event_annotations,
    update_note_content,
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


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
) -> Response:
    try:
        await delete_conversation_for_owner(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
            content_json=body.content_json,
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
    ids = [e.id for e in events]
    starred_ids, note_counts = await tree_event_annotations(session, ids, user_id)
    out: list[EventNodeOut] = []
    for e in events:
        out.append(
            EventNodeOut(
                id=e.id,
                conversation_id=e.conversation_id,
                parent_event_id=e.parent_event_id,
                kind=e.kind,
                actor_type=e.actor_type,
                actor_user_id=e.actor_user_id,
                content_text=e.content_text,
                content_json=e.content_json,
                visible_to=e.visible_to,
                created_at=e.created_at,
                updated_at=e.updated_at,
                starred=e.id in starred_ids,
                note_count=note_counts.get(e.id, 0),
            )
        )
    return TreeResponse(events=out)


@router.post("/{conversation_id}/active", response_model=ConversationUserStateOut)
async def post_conversation_active(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    body: SetActiveBody,
) -> ConversationUserStateOut:
    try:
        st = await set_conversation_active_event(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            active_event_id=body.active_event_id,
            needs_context_rebuild=body.needs_context_rebuild,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from None
    await session.commit()
    return ConversationUserStateOut.model_validate(st)


@router.get("/{conversation_id}/members", response_model=list[MemberOut])
async def get_conversation_members(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
) -> list[MemberOut]:
    try:
        rows = await list_conversation_members(session, conversation_id, user_id)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    out: list[MemberOut] = []
    for uid, role, email, display_name in rows:
        out.append(
            MemberOut.model_validate(
                {
                    "user_id": uid,
                    "role": role,
                    "email": email or None,
                    "display_name": display_name or None,
                }
            )
        )
    return out


@router.get("/{conversation_id}/notes", response_model=list[NoteOut])
async def get_conversation_notes(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
) -> list[NoteOut]:
    try:
        notes = await list_notes_visible(session, conversation_id, user_id)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    return [NoteOut.model_validate(n) for n in notes]


@router.post("/{conversation_id}/notes", response_model=NoteOut)
async def post_conversation_note(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    body: NoteCreateBody,
) -> NoteOut:
    try:
        note = await create_note_on_event(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            event_id=body.event_id,
            content=body.content,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from None
    await session.commit()
    return NoteOut.model_validate(note)


@router.patch("/{conversation_id}/notes/{note_id}", response_model=NoteOut)
async def patch_conversation_note(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    note_id: UUID,
    body: NotePatchBody,
) -> NoteOut:
    try:
        note = await update_note_content(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            note_id=note_id,
            content=body.content,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from None
    await session.commit()
    return NoteOut.model_validate(note)


@router.delete("/{conversation_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation_note(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    note_id: UUID,
) -> Response:
    try:
        await delete_note_row(session, conversation_id=conversation_id, user_id=user_id, note_id=note_id)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/{conversation_id}/events/{event_id}/star",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def put_star(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    event_id: UUID,
) -> Response:
    try:
        await put_event_star(session, conversation_id=conversation_id, user_id=user_id, event_id=event_id)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/{conversation_id}/events/{event_id}/star",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_star(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    event_id: UUID,
) -> Response:
    try:
        await delete_event_star(session, conversation_id=conversation_id, user_id=user_id, event_id=event_id)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
