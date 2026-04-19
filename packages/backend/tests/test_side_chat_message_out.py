"""Side-chat API row shaping (author join fields)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from colcoor_backend.db.models import SideChatMessage, User
from colcoor_backend.services.side_chat import side_chat_message_to_out


def test_side_chat_message_to_out_without_author() -> None:
    cid = uuid.uuid4()
    now = datetime.now(tz=UTC)
    msg = SideChatMessage(
        id=uuid.uuid4(),
        conversation_id=cid,
        seq=2,
        kind="system_join",
        author_user_id=None,
        body=None,
        referenced_event_id=None,
        referenced_note_id=None,
        referenced_side_chat_message_id=None,
        created_at=now,
        updated_at=now,
        edited_at=None,
        deleted_at=None,
    )
    out = side_chat_message_to_out(msg, None)
    assert out.author_display_name is None
    assert out.author_avatar_url is None
    assert out.kind == "system_join"


def test_side_chat_message_to_out_with_author_display_and_avatar() -> None:
    cid = uuid.uuid4()
    uid = uuid.uuid4()
    mid = uuid.uuid4()
    now = datetime.now(tz=UTC)
    msg = SideChatMessage(
        id=mid,
        conversation_id=cid,
        seq=1,
        kind="user",
        author_user_id=uid,
        body="x",
        referenced_event_id=None,
        referenced_note_id=None,
        referenced_side_chat_message_id=None,
        created_at=now,
        updated_at=now,
        edited_at=None,
        deleted_at=None,
    )
    author = User(
        id=uid,
        cursor_sub="sub-x",
        email="u@v.w",
        display_name="  Pat  ",
        avatar_url="https://x/y.png",
        last_login_at=now,
    )
    out = side_chat_message_to_out(msg, author)
    assert out.author_display_name == "Pat"
    assert out.author_avatar_url == "https://x/y.png"


def test_side_chat_message_to_out_blank_display_name_becomes_none() -> None:
    cid = uuid.uuid4()
    uid = uuid.uuid4()
    now = datetime.now(tz=UTC)
    msg = SideChatMessage(
        id=uuid.uuid4(),
        conversation_id=cid,
        seq=1,
        kind="user",
        author_user_id=uid,
        body="x",
        referenced_event_id=None,
        referenced_note_id=None,
        referenced_side_chat_message_id=None,
        created_at=now,
        updated_at=now,
        edited_at=None,
        deleted_at=None,
    )
    author = User(
        id=uid,
        cursor_sub="sub-y",
        email="u@v.w",
        display_name="   ",
        avatar_url=None,
        last_login_at=now,
    )
    out = side_chat_message_to_out(msg, author)
    assert out.author_display_name is None
    assert out.author_avatar_url is None


def test_side_chat_message_to_out_soft_deleted_redacts_and_self_kind() -> None:
    cid = uuid.uuid4()
    uid = uuid.uuid4()
    now = datetime.now(tz=UTC)
    msg = SideChatMessage(
        id=uuid.uuid4(),
        conversation_id=cid,
        seq=1,
        kind="user",
        author_user_id=uid,
        body="secret",
        content_json={"x": 1},
        referenced_event_id=uuid.uuid4(),
        referenced_note_id=uuid.uuid4(),
        referenced_side_chat_message_id=uuid.uuid4(),
        created_at=now,
        updated_at=now,
        edited_at=now,
        deleted_at=now,
        deleted_by_user_id=uid,
    )
    author = User(
        id=uid,
        cursor_sub="sub-z",
        email="u@v.w",
        display_name="Self",
        avatar_url=None,
        last_login_at=now,
    )
    out = side_chat_message_to_out(msg, author)
    assert out.body is None
    assert out.content_json is None
    assert out.referenced_event_id is None
    assert out.referenced_note_id is None
    assert out.referenced_side_chat_message_id is None
    assert out.edited_at is None
    assert out.deletion_kind == "self"
    assert out.deleted_by_user_id == uid


def test_side_chat_message_to_out_soft_deleted_moderator_kind() -> None:
    cid = uuid.uuid4()
    author_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    now = datetime.now(tz=UTC)
    msg = SideChatMessage(
        id=uuid.uuid4(),
        conversation_id=cid,
        seq=1,
        kind="user",
        author_user_id=author_id,
        body="gone",
        referenced_event_id=None,
        referenced_note_id=None,
        referenced_side_chat_message_id=None,
        created_at=now,
        updated_at=now,
        edited_at=None,
        deleted_at=now,
        deleted_by_user_id=owner_id,
    )
    author = User(
        id=author_id,
        cursor_sub="sub-a",
        email="a@v.w",
        display_name="Pat",
        avatar_url=None,
        last_login_at=now,
    )
    out = side_chat_message_to_out(msg, author)
    assert out.deletion_kind == "moderator"
    assert out.deleted_by_user_id == owner_id
