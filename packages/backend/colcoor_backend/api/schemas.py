from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class EventKind(str, Enum):
    user_input = "user_input"
    assistant_output = "assistant_output"


class AppendEventBody(BaseModel):
    """Body for POST .../append-event (docs/data-flow-and-api.md §5)."""

    kind: EventKind
    parent_event_id: UUID
    content: str
    author: str = Field(..., description="e.g. end_user, cursor_agent")
    private_branch: bool = False


class AuthCursorRequest(BaseModel):
    """Placeholder: extension sends Cursor-issued token for exchange (docs/authentication.md §3)."""

    cursor_access_token: str = Field(..., min_length=1)


class AuthResponse(BaseModel):
    """Aligned with web AuthResponse shape when reusing clients; stub until JWT is implemented."""

    access_token: str
    token_type: str = "bearer"
