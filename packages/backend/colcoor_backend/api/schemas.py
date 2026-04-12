from datetime import datetime
from enum import Enum
from uuid import UUID

from typing import Literal

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
    """Exchange a VS Code / Cursor auth provider access token for a Colcoor API JWT."""

    cursor_access_token: str = Field(..., min_length=1)
    provider_hint: Literal["auto", "github", "microsoft", "google"] = "auto"


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class DevLoginRequest(BaseModel):
    cursor_sub: str = Field(..., min_length=1)
    email: str = Field(..., min_length=3)
    display_name: str = ""


class ConversationCreate(BaseModel):
    title: str | None = None


class ConversationPatch(BaseModel):
    """PATCH body: include only fields to change (see api-contracts §3.3)."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, description="Conversation title; omit key to leave unchanged")
    pinned: bool | None = Field(
        default=None,
        description="Caller’s per-user pin for this conversation; omit key to leave unchanged",
    )


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
