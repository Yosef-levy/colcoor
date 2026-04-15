from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse

from colcoor_backend.api.deps import CurrentUserId, DbSession
from colcoor_backend.api.schemas import (
    SideChatMessageOut,
    SideChatMessagesResponse,
    SideChatPatchBody,
    SideChatPostBody,
    SideChatReadPatchBody,
)
from colcoor_backend.services.graph import ensure_conversation_member
from colcoor_backend.services.side_chat import (
    list_side_chat_messages,
    patch_side_chat_message_body,
    patch_side_chat_read_cursor,
    post_user_side_chat_message,
    side_chat_message_to_out_fetched,
    side_chat_messages_to_outs,
    soft_delete_side_chat_message,
)
from colcoor_backend.services.side_chat_sse import iter_side_chat_sse

router = APIRouter()


@router.get("/{conversation_id}/side-chat/stream")
async def side_chat_event_stream(
    request: Request,
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    after_seq: int = Query(default=0, ge=0),
) -> StreamingResponse:
    """Server-Sent Events: JSON per ``data:`` line (api-contracts §10.6)."""
    try:
        await ensure_conversation_member(session, conversation_id, user_id)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    factory = getattr(request.app.state, "session_factory", None)
    engine = getattr(request.app.state, "db_engine", None)
    if factory is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="database not configured",
        )
    return StreamingResponse(
        iter_side_chat_sse(
            factory,
            engine=engine,
            conversation_id=conversation_id,
            user_id=user_id,
            after_seq=after_seq,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{conversation_id}/side-chat/messages", response_model=SideChatMessagesResponse)
async def get_side_chat_messages(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    after_seq: int = Query(default=0, ge=0),
) -> SideChatMessagesResponse:
    try:
        rows = await list_side_chat_messages(
            session, conversation_id, user_id, after_seq=after_seq
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    return SideChatMessagesResponse(messages=await side_chat_messages_to_outs(session, rows))


@router.post("/{conversation_id}/side-chat/messages", response_model=SideChatMessageOut)
async def post_side_chat_message(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    body: SideChatPostBody,
) -> SideChatMessageOut:
    try:
        msg = await post_user_side_chat_message(
            session,
            conversation_id,
            user_id,
            body=body.body,
            content_json=body.content_json,
            referenced_event_id=body.referenced_event_id,
            referenced_note_id=body.referenced_note_id,
            referenced_side_chat_message_id=body.referenced_side_chat_message_id,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from None
    out = await side_chat_message_to_out_fetched(session, msg)
    await session.commit()
    return out


@router.patch(
    "/{conversation_id}/side-chat/messages/{message_id}",
    response_model=SideChatMessageOut,
)
async def patch_side_chat_message_route(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    message_id: UUID,
    body: SideChatPatchBody,
) -> SideChatMessageOut:
    try:
        msg = await patch_side_chat_message_body(
            session,
            conversation_id,
            user_id,
            message_id,
            new_body=body.body,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    out = await side_chat_message_to_out_fetched(session, msg)
    await session.commit()
    return out


@router.delete(
    "/{conversation_id}/side-chat/messages/{message_id}",
    response_model=SideChatMessageOut,
)
async def delete_side_chat_message_route(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    message_id: UUID,
) -> SideChatMessageOut:
    try:
        msg = await soft_delete_side_chat_message(
            session, conversation_id, user_id, message_id
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found") from None
    out = await side_chat_message_to_out_fetched(session, msg)
    await session.commit()
    return out


@router.patch("/{conversation_id}/side-chat/read", status_code=status.HTTP_204_NO_CONTENT)
async def patch_side_chat_read_route(
    session: DbSession,
    user_id: CurrentUserId,
    conversation_id: UUID,
    body: SideChatReadPatchBody,
) -> Response:
    try:
        await patch_side_chat_read_cursor(
            session,
            conversation_id,
            user_id,
            last_read_seq=body.last_read_seq,
        )
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden") from None
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
