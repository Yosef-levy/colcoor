from uuid import UUID

from fastapi import APIRouter, Response, status

router = APIRouter()


@router.post(
    "/conversations/{conversation_id}/message/stream",
    status_code=status.HTTP_410_GONE,
)
def message_stream_gone(conversation_id: UUID) -> Response:  # noqa: ARG001
    """Return 410; transcript main-thread streaming is not implemented on this API."""
    return Response(status_code=status.HTTP_410_GONE)


@router.post(
    "/conversations/{conversation_id}/resend/stream",
    status_code=status.HTTP_410_GONE,
)
def resend_stream_gone(conversation_id: UUID) -> Response:  # noqa: ARG001
    return Response(status_code=status.HTTP_410_GONE)
