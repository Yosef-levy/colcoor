from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from colcoor_backend.api.deps import BearerToken
from colcoor_backend.api.schemas import AppendEventBody, EventKind

router = APIRouter()


@router.post("/{conversation_id}/append-event")
def append_event(
    _token: BearerToken,
    conversation_id: UUID,
    body: AppendEventBody,
) -> dict[str, str]:
    """Persist user_input / assistant_output (docs/data-flow-and-api.md §5).

    Stub: validates shape only; persistence layer not wired.
    """
    if body.kind == EventKind.assistant_output and body.private_branch:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="private_branch applies to user_input only",
        )
    _ = conversation_id
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="append-event persistence not implemented",
    )


@router.get("/{conversation_id}/tree")
def get_tree(_token: BearerToken, conversation_id: UUID) -> dict:
    """Tree snapshot for the extension UI (docs/data-flow-and-api.md §8)."""
    _ = conversation_id
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="GET tree not implemented",
    )
