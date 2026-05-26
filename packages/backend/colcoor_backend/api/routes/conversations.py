from datetime import timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import RedirectResponse

from colcoor_backend.api.deps import CurrentUserId, DbSession
from colcoor_backend.core.config import get_settings
from colcoor_backend.db.models import Conversation, ConversationMember
from colcoor_backend.api.schemas import (
    AppendEventBody,
    ConversationCreate,
    ConversationImageUploadOut,
    ConversationOut,
    ConversationPatch,
    ConversationUserStateOut,
    EventCheckpointLabelPatchBody,
    EventKind,
    EventNodeOut,
    MemberAddBody,
    MemberInviteCandidateOut,
    MemberOut,
    MemberRolePatchBody,
    NoteCreateBody,
    NoteOut,
    NotePatchBody,
    SetActiveBody,
    EventSubtreeSoftDeleteOut,
    RestoreSubtreeOut,
    TreeResponse,
    UndoEventDeletionBody,
)
from colcoor_backend.services.append_event_idempotency import (
    IDEMPOTENCY_KEY_HEADER,
    IdempotencyKeyError,
    append_graph_event_idempotent,
    normalize_idempotency_key,
)
from colcoor_backend.services.graph import (
    add_conversation_member,
    create_conversation_with_owner,
    create_note_on_event,
    restore_soft_deleted_conversation_graph,
    soft_delete_conversation_for_owner,
    delete_event_star,
    delete_note_row,
    list_conversation_members,
    list_conversations_for_user,
    list_events_for_tree,
    list_notes_visible,
    patch_conversation_for_user,
    patch_event_checkpoint_label,
    put_event_star,
    read_conversation_caller_state,
    remove_conversation_member,
    restore_soft_deleted_subtree,
    search_conversation_member_invite_candidates,
    set_conversation_active_event,
    soft_delete_event_subtree,
    tree_event_annotations,
    undo_soft_delete_by_deletion_group,
    update_conversation_member_role,
    update_note_content,
)
from colcoor_backend.services.conversation_images import (
    delete_conversation_image,
    get_conversation_image_row,
    load_conversation_image_bytes,
    store_conversation_image,
)
from colcoor_backend.storage.protocol import ImageBlobStorage
from colcoor_backend.services.side_chat import (
    get_user_side_chat_last_read_seq,
    side_chat_unread_count_by_conversation_ids,
)

router = APIRouter()


def _image_storage(request: Request) -> ImageBlobStorage:
    storage = getattr(request.app.state, "image_blob_storage", None)
    if storage is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="image storage not configured",
        )
    return storage


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
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
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


@router.delete("/{conversation_id}", response_model=EventSubtreeSoftDeleteOut)
async def delete_conversation(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
) -> EventSubtreeSoftDeleteOut:
    try:
        result = await soft_delete_conversation_for_owner(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    await session.commit()
    return EventSubtreeSoftDeleteOut(
        deleted_count=result.deleted_count,
        deletion_group_id=result.deletion_group_id,
    )


@router.post(
    "/{conversation_id}/restore-deleted",
    response_model=RestoreSubtreeOut,
)
async def restore_deleted_conversation(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
) -> RestoreSubtreeOut:
    """Clear owner soft-delete for the whole conversation (owner/editor); same batch as ``DELETE`` this conversation."""
    try:
        n = await restore_soft_deleted_conversation_graph(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from None
    await session.commit()
    return RestoreSubtreeOut(restored_count=n)


@router.post("/{conversation_id}/append-event")
async def append_event(
    request: Request,
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    body: AppendEventBody,
) -> dict[str, str | bool]:
    if body.kind == EventKind.assistant_output and body.private_branch:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="private_branch applies to user_input only",
        )
    try:
        idempotency_key = normalize_idempotency_key(request.headers.get(IDEMPOTENCY_KEY_HEADER))
    except IdempotencyKeyError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from None
    try:
        ev, replayed = await append_graph_event_idempotent(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
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
    except TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="idempotency key in flight; retry shortly",
        ) from None
    await session.commit()
    return {"id": str(ev.id), "replayed": replayed}


@router.post("/{conversation_id}/images", response_model=ConversationImageUploadOut)
async def post_conversation_image(
    request: Request,
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    file: Annotated[UploadFile, File()],
) -> ConversationImageUploadOut:
    """Upload image to blob storage (owner or editor only)."""
    storage = _image_storage(request)
    try:
        raw = await file.read()
        mime = (file.content_type or "application/octet-stream").split(";")[0].strip().lower()
        row = await store_conversation_image(
            session,
            storage,
            conversation_id=conversation_id,
            user_id=user_id,
            mime_type=mime,
            data=raw,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
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
    request: Request,
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    image_id: UUID,
) -> Response:
    """Member-only: redirect to a GCS signed URL, or stream bytes (local dev)."""
    storage = _image_storage(request)
    try:
        row = await get_conversation_image_row(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            image_id=image_id,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")

    signed = storage.signed_download_url(row.object_key)
    if signed:
        return RedirectResponse(url=signed, status_code=status.HTTP_302_FOUND)

    try:
        got = await load_conversation_image_bytes(
            session,
            storage,
            conversation_id=conversation_id,
            user_id=user_id,
            image_id=image_id,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    if got is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    data, mime = got
    return Response(content=data, media_type=mime)


@router.delete("/{conversation_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation_image_route(
    request: Request,
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    image_id: UUID,
) -> Response:
    """Remove image metadata and blob (owner or editor only)."""
    storage = _image_storage(request)
    try:
        deleted = await delete_conversation_image(
            session,
            storage,
            conversation_id=conversation_id,
            user_id=user_id,
            image_id=image_id,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
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
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    out = ConversationUserStateOut.model_validate(st)
    lr = await get_user_side_chat_last_read_seq(session, conversation_id, user_id)
    return out.model_copy(update={"side_chat_last_read_seq": lr})


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
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from None
    await session.commit()
    out = ConversationUserStateOut.model_validate(st)
    lr = await get_user_side_chat_last_read_seq(session, conversation_id, user_id)
    return out.model_copy(update={"side_chat_last_read_seq": lr})


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
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    out: list[MemberOut] = []
    for uid, role, email, display_name, handle in rows:
        out.append(
            MemberOut.model_validate(
                {
                    "user_id": uid,
                    "role": role,
                    "email": email or None,
                    "display_name": display_name or None,
                    "handle": handle,
                }
            )
        )
    return out


@router.get(
    "/{conversation_id}/member-invite-search",
    response_model=list[MemberInviteCandidateOut],
)
async def get_member_invite_search(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    q: Annotated[str, Query(min_length=1, max_length=320)],
) -> list[MemberInviteCandidateOut]:
    """Search existing Colcoor users by UUID, full email (case-insensitive), or handle (``@`` optional)."""
    try:
        rows = await search_conversation_member_invite_candidates(
            session,
            conversation_id=conversation_id,
            actor_user_id=user_id,
            query=q,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        ) from None
    out: list[MemberInviteCandidateOut] = []
    for uid, em, dn, handle, avatar, last_at in rows:
        out.append(
            MemberInviteCandidateOut.model_validate(
                {
                    "user_id": uid,
                    "email": em,
                    "display_name": dn or None,
                    "handle": handle,
                    "avatar_url": avatar,
                    "last_login_at": last_at,
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
        uid, role, email, display_name, handle = await add_conversation_member(
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
            "handle": handle,
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
        uid, role, email, display_name, handle = await update_conversation_member_role(
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
            "handle": handle,
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
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
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


@router.delete(
    "/{conversation_id}/events/{event_id}",
    response_model=EventSubtreeSoftDeleteOut,
)
async def delete_event_subtree(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    event_id: UUID,
) -> EventSubtreeSoftDeleteOut:
    """Soft-delete ``event_id`` and all descendants (``events.deleted_at``); stars removed; notes hidden."""
    try:
        result = await soft_delete_event_subtree(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            event_id=event_id,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from None
    await session.commit()
    return EventSubtreeSoftDeleteOut(
        deleted_count=result.deleted_count,
        deletion_group_id=result.deletion_group_id,
    )


@router.post(
    "/{conversation_id}/events/undo-delete",
    response_model=RestoreSubtreeOut,
)
async def undo_event_deletion(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    body: UndoEventDeletionBody,
) -> RestoreSubtreeOut:
    """Undo a recent soft-delete by ``deletion_group_id`` (same user, within configured undo window)."""
    settings = get_settings()
    window = timedelta(minutes=settings.event_delete_undo_window_minutes)
    try:
        n = await undo_soft_delete_by_deletion_group(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            deletion_group_id=body.deletion_group_id,
            undo_window=window,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    await session.commit()
    return RestoreSubtreeOut(restored_count=n)


@router.post(
    "/{conversation_id}/events/{event_id}/restore-subtree",
    response_model=RestoreSubtreeOut,
)
async def restore_event_subtree(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    event_id: UUID,
) -> RestoreSubtreeOut:
    """Clear soft-delete for a subtree (owner/editor); anchor must carry ``deletion_group_id``."""
    try:
        n = await restore_soft_deleted_subtree(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            event_id=event_id,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from None
    await session.commit()
    return RestoreSubtreeOut(restored_count=n)


@router.patch(
    "/{conversation_id}/events/{event_id}/checkpoint-label",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def patch_event_title(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    event_id: UUID,
    body: EventCheckpointLabelPatchBody,
) -> Response:
    """Set or clear display-only ``checkpoint_label`` (message title) on an existing graph event."""
    try:
        await patch_event_checkpoint_label(
            session,
            conversation_id=conversation_id,
            user_id=user_id,
            event_id=event_id,
            checkpoint_label=body.checkpoint_label,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from None
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
