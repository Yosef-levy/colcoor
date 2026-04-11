from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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
    access_token: str
    token_type: str = "bearer"


class DevLoginRequest(BaseModel):
    cursor_sub: str = Field(..., min_length=1)
    email: str = Field(..., min_length=3)
    display_name: str = ""


class ConversationCreate(BaseModel):
    title: str | None = None


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str | None
    pinned: bool
    updated_at: datetime


class EventNodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    id: UUID
    conversation_id: UUID
    parent_event_id: UUID | None
    kind: str
    actor_type: str
    actor_user_id: UUID | None
    content_text: str | None
    visible_to: UUID | None
    created_at: datetime
    updated_at: datetime


class TreeResponse(BaseModel):
    events: list[EventNodeOut]
