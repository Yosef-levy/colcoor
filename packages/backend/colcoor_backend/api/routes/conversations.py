from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Response, UploadFile, status

from colcoor_backend.api.deps import CurrentUserId, DbSession
from colcoor_backend.db.models import Conversation, ConversationMember
from colcoor_backend.api.schemas import (
    AppendEventBody,
    ConversationCreate,
    ConversationImageUploadOut,
    ConversationOut,
    ConversationPatch,
    ConversationUserStateOut,
    EventKind,
    EventNodeOut,
    MemberAddBody,
    MemberOut,
    MemberRolePatchBody,
    NoteCreateBody,
    NoteOut,
    NotePatchBody,
    SetActiveBody,
    TreeResponse,
)
from colcoor_backend.services.graph import (
    add_conversation_member,
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
    read_conversation_caller_state,
    remove_conversation_member,
    set_conversation_active_event,
    tree_event_annotations,
    update_conversation_member_role,
    update_note_content,
)
from colcoor_backend.services.conversation_images import (
    load_conversation_image_bytes,
    store_conversation_image,
)
from colcoor_backend.services.side_chat import side_chat_unread_count_by_conversation_ids

router = APIRouter()


def _conversation_out(
    conv: Conversation,
    member: ConversationMember,
    *,
    side_chat_has_unread: bool = False,
    side_chat_unread_count: int = 0,
) -> ConversationOut:
    return ConversationOut(
        id=conv.id,
        title=conv.title,
        pinned=member.pinned,
        updated_at=conv.updated_at,
        side_chat_has_unread=side_chat_has_unread,
        side_chat_unread_count=side_chat_unread_count,
    )


@router.get("", response_model=list[ConversationOut])
async def list_conversations(
    session: DbSession,
    user_id: CurrentUserId,
) -> list[ConversationOut]:
    rows = await list_conversations_for_user(session, user_id)
    ids = [c.id for c, _ in rows]
    unread_counts = await side_chat_unread_count_by_conversation_ids(session, user_id, ids)
    return [
        _conversation_out(
            c,
            m,
            side_chat_has_unread=unread_counts.get(c.id, 0) > 0,
            side_chat_unread_count=unread_counts.get(c.id, 0),
        )
        for c, m in rows
    ]


@router.post("", response_model=ConversationOut)
async def create_conversation(
    session: DbSession,
    user_id: CurrentUserId,
    body: ConversationCreate,
) -> ConversationOut:
    conv, member = await create_conversation_with_owner(session, user_id=user_id, title=body.title)
    await session.commit()
    unread_counts = await side_chat_unread_count_by_conversation_ids(session, user_id, [conv.id])
    return _conversation_out(
        conv,
        member,
        side_chat_has_unread=unread_counts.get(conv.id, 0) > 0,
        side_chat_unread_count=unread_counts.get(conv.id, 0),
    )


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
    unread_counts = await side_chat_unread_count_by_conversation_ids(session, user_id, [conv.id])
    return _conversation_out(
        conv,
        member,
        side_chat_has_unread=unread_counts.get(conv.id, 0) > 0,
        side_chat_unread_count=unread_counts.get(conv.id, 0),
    )


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
            checkpoint_label=body.checkpoint_label,
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


@router.post("/{conversation_id}/images", response_model=ConversationImageUploadOut)
async def post_conversation_image(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    file: UploadFile = File(...),
) -> ConversationImageUploadOut:
    """Upload image bytes for later reference from a ``user_input`` or side-chat ``content_json``."""
    try:
        raw = await file.read()
        mime = (file.content_type or "application/octet-stream").split(";")[0].strip().lower()
        row = await store_conversation_image(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            mime_type=mime,
            data=raw,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from None
    await session.commit()
    return ConversationImageUploadOut(
        id=row.id,
        mime_type=row.mime_type,
        byte_size=row.byte_size,
    )


@router.get("/{conversation_id}/images/{image_id}")
async def get_conversation_image(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    image_id: UUID,
) -> Response:
    """Return raw image bytes for conversation members (Authorization: Bearer)."""
    try:
        got = await load_conversation_image_bytes(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            image_id=image_id,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    if got is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    data, mime = got
    return Response(content=data, media_type=mime)


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
                checkpoint_label=e.checkpoint_label,
            )
        )
    return TreeResponse(events=out)


@router.get("/{conversation_id}/caller-state", response_model=ConversationUserStateOut)
async def get_caller_conversation_state(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
) -> ConversationUserStateOut:
    """Read the caller’s active cursor and ``needs_context_rebuild`` (no body)."""
    try:
        st = await read_conversation_caller_state(session, conversation_id, user_id)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    return ConversationUserStateOut.model_validate(st)


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


@router.post("/{conversation_id}/members", response_model=MemberOut)
async def post_conversation_member(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    body: MemberAddBody,
) -> MemberOut:
    try:
        uid, role, email, display_name = await add_conversation_member(
            session,
            conversation_id=conversation_id,
            actor_user_id=user_id,
            new_user_id=body.user_id,
            role=body.role,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    except ValueError as e:
        if "already a member" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(e),
            ) from None
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        ) from None
    await session.commit()
    return MemberOut.model_validate(
        {
            "user_id": uid,
            "role": role,
            "email": email or None,
            "display_name": display_name or None,
        }
    )


@router.patch("/{conversation_id}/members/{member_user_id}", response_model=MemberOut)
async def patch_conversation_member(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    member_user_id: UUID,
    body: MemberRolePatchBody,
) -> MemberOut:
    try:
        uid, role, email, display_name = await update_conversation_member_role(
            session,
            conversation_id=conversation_id,
            actor_user_id=user_id,
            target_user_id=member_user_id,
            new_role=body.role,
        )
    except PermissionError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e) or "forbidden",
        ) from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        ) from None
    await session.commit()
    return MemberOut.model_validate(
        {
            "user_id": uid,
            "role": role,
            "email": email or None,
            "display_name": display_name or None,
        }
    )


@router.delete(
    "/{conversation_id}/members/{member_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_conversation_member(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    member_user_id: UUID,
) -> Response:
    try:
        await remove_conversation_member(
            session,
            conversation_id=conversation_id,
            actor_user_id=user_id,
            target_user_id=member_user_id,
        )
    except PermissionError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e) or "forbidden",
        ) from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
