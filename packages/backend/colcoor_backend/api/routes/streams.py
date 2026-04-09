from uuid import UUID

from fastapi import APIRouter, Response, status

router = APIRouter()


@router.post(
    "/conversations/{conversation_id}/message/stream",
    status_code=status.HTTP_410_GONE,
)
def message_stream_gone(_conversation_id: UUID) -> Response:
    """Main-thread streaming is not implemented on the extension backend (docs/architecture.md §6)."""
    return Response(status_code=status.HTTP_410_GONE)


@router.post(
    "/conversations/{conversation_id}/resend/stream",
    status_code=status.HTTP_410_GONE,
)
def resend_stream_gone(_conversation_id: UUID) -> Response:
    return Response(status_code=status.HTTP_410_GONE)
