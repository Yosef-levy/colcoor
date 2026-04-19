from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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
    content_json: dict[str, Any] | None = Field(
        default=None,
        description="assistant_output: e.g. colcoor_agent_trace. user_input: only colcoor_user_media (image refs).",
    )
    checkpoint_label: str | None = Field(
        default=None,
        max_length=256,
        description="Optional display-only label for breadcrumb / checkpoint UI ([ui-features.md] §8).",
    )

    @model_validator(mode="after")
    def _content_json_by_kind(self) -> AppendEventBody:
        if self.content_json is None:
            return self
        if self.kind == EventKind.assistant_output:
            return self
        if self.kind == EventKind.user_input:
            keys = set(self.content_json.keys())
            if keys != {"colcoor_user_media"}:
                raise ValueError("user_input content_json must only contain the colcoor_user_media key")
            return self
        return self

    @field_validator("checkpoint_label", mode="before")
    @classmethod
    def _normalize_checkpoint_label(cls, v: object) -> str | None:
        if v is None:
            return None
        if not isinstance(v, str):
            return None
        t = v.strip()
        return t or None


class AuthCursorRequest(BaseModel):
    """Exchange a VS Code / Cursor auth provider access token for a Colcoor API JWT."""

    cursor_access_token: str = Field(..., min_length=1)
    provider_hint: Literal["auto", "github", "microsoft", "google"] = "auto"


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


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
    side_chat_has_unread: bool = Field(
        default=False,
        description="True when max non-deleted side-chat seq exceeds caller last_read_seq",
    )
    side_chat_unread_count: int = Field(
        default=0,
        ge=0,
        description="Count of non-deleted side-chat rows newer than caller last_read_seq",
    )


class EventNodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    id: UUID
    conversation_id: UUID
    parent_event_id: UUID | None
    kind: str
    actor_type: str
    actor_user_id: UUID | None
    content_text: str | None
    content_json: dict[str, Any] | None = None
    visible_to: UUID | None
    created_at: datetime
    updated_at: datetime
    starred: bool = False
    note_count: int = 0
    checkpoint_label: str | None = None


class EventCheckpointLabelPatchBody(BaseModel):
    """PATCH …/events/{id}/checkpoint-label — set or clear display-only title on an existing event."""

    model_config = ConfigDict(extra="forbid")

    checkpoint_label: str | None = Field(
        default=None,
        max_length=256,
        description="New title text, or null/blank to clear ([ui-features.md] §8).",
    )

    @field_validator("checkpoint_label", mode="before")
    @classmethod
    def _normalize_event_title(cls, v: object) -> str | None:
        if v is None:
            return None
        if not isinstance(v, str):
            return None
        t = v.replace("\r\n", "\n").replace("\r", "\n").strip()
        return t or None


class TreeResponse(BaseModel):
    events: list[EventNodeOut]


class ConversationImageUploadOut(BaseModel):
    """Response from POST …/conversations/{id}/images after persisting bytes."""

    id: UUID
    mime_type: str
    byte_size: int


class MemberOut(BaseModel):
    """One row in GET /conversations/{id}/members (api-contracts §4.1)."""

    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    role: Literal["owner", "editor", "viewer"]
    email: str | None = None
    display_name: str | None = None


class MemberInviteCandidateOut(BaseModel):
    """One row in GET /conversations/{id}/member-invite-search (api-contracts §4.1a)."""

    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: str
    display_name: str | None = None
    handle: str | None = None
    avatar_url: str | None = None
    last_login_at: datetime


class MemberAddBody(BaseModel):
    """POST …/members (api-contracts §4.2)."""

    model_config = ConfigDict(extra="forbid")

    user_id: UUID
    role: Literal["editor", "viewer"]


class MemberRolePatchBody(BaseModel):
    """PATCH …/members/{user_id} (api-contracts §4.3)."""

    model_config = ConfigDict(extra="forbid")

    role: Literal["owner", "editor", "viewer"]


class SetActiveBody(BaseModel):
    """POST …/active (api-contracts §5.2)."""

    model_config = ConfigDict(extra="forbid")

    active_event_id: UUID
    needs_context_rebuild: bool = False


class ConversationUserStateOut(BaseModel):
    """Caller’s active cursor row (api-contracts §5.2)."""

    model_config = ConfigDict(from_attributes=True)

    conversation_id: UUID
    user_id: UUID
    active_event_id: UUID
    needs_context_rebuild: bool
    last_seen_at: datetime
    # Per-user side-chat read cursor; 0 when never set (see UserSideChatState.last_read_seq).
    side_chat_last_read_seq: int = 0


class NoteOut(BaseModel):
    """GET/POST/PATCH notes (api-contracts §7)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    event_id: UUID
    author_user_id: UUID
    content: str
    created_at: datetime
    updated_at: datetime


class NoteCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: UUID
    content: str = Field(..., min_length=1)


class NotePatchBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(..., min_length=1)


class MePatchBody(BaseModel):
    """PATCH /me (api-contracts §9.1). At least one field must be present in the JSON object."""

    model_config = ConfigDict(extra="forbid")

    display_name: str | None = None
    avatar_url: str | None = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> MePatchBody:
        if not self.model_fields_set:
            raise ValueError("at least one of display_name, avatar_url is required")
        return self


class MeOut(BaseModel):
    """Caller profile (api-contracts §9.1)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    display_name: str
    avatar_url: str | None
    access_token: str | None = Field(
        default=None,
        description="Omitted unless the server refreshes JWT claims (not used on simple profile patch).",
    )


class SideChatMessageOut(BaseModel):
    """Side-chat row (api-contracts §10); author fields are joined from ``users`` when present."""

    id: UUID
    conversation_id: UUID
    seq: int
    kind: Literal["user", "system_join", "system_leave"]
    author_user_id: UUID | None
    author_display_name: str | None = None
    author_avatar_url: str | None = None
    body: str | None
    content_json: dict[str, Any] | None = None
    referenced_event_id: UUID | None
    referenced_note_id: UUID | None
    referenced_side_chat_message_id: UUID | None
    created_at: datetime
    updated_at: datetime
    edited_at: datetime | None
    deleted_at: datetime | None
    deleted_by_user_id: UUID | None = Field(
        default=None,
        description="Set when soft-deleted: user id who performed the delete.",
    )
    deletion_kind: Literal["self", "moderator"] | None = Field(
        default=None,
        description="When deleted: author removed their own row vs someone else (conversation owner).",
    )


class SideChatMessagesResponse(BaseModel):
    messages: list[SideChatMessageOut]


class SideChatPostBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["user"] = "user"
    body: str = ""
    content_json: dict[str, Any] | None = None
    referenced_event_id: UUID | None = None
    referenced_note_id: UUID | None = None
    referenced_side_chat_message_id: UUID | None = None

    @field_validator("body")
    @classmethod
    def _strip_body(cls, v: object) -> str:
        if v is None:
            return ""
        return str(v).strip()

    @model_validator(mode="after")
    def _body_or_media(self) -> SideChatPostBody:
        from colcoor_backend.services.conversation_images import has_colcoor_user_media

        if not self.body and not has_colcoor_user_media(self.content_json):
            raise ValueError("body must be non-empty or content_json must include colcoor_user_media images")
        return self


class SideChatPatchBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: str = Field(..., min_length=1)

    @field_validator("body")
    @classmethod
    def _strip_body(cls, v: str) -> str:
        t = v.strip()
        if not t:
            raise ValueError("body must be non-empty after trim")
        return t


class SideChatReadPatchBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    last_read_seq: int = Field(..., ge=0)


class EventSubtreeSoftDeleteOut(BaseModel):
    """Response for DELETE …/events/{event_id} (soft-delete subtree) and DELETE …/conversations/{id}."""

    deleted_count: int = Field(..., ge=0)
    deletion_group_id: UUID | None = Field(
        default=None,
        description="Present when ``deleted_count`` > 0; use with POST …/events/undo-delete within the undo window (conversation delete uses the same shape).",
    )


class UndoEventDeletionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    deletion_group_id: UUID


class RestoreSubtreeOut(BaseModel):
    """Response for undo-delete and restore-subtree."""

    restored_count: int = Field(..., ge=0)
