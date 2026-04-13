"""SSE side-chat payload formatting (api-contracts §10.6) without HTTP."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from colcoor_backend.db.models import SideChatMessage
from colcoor_backend.services.side_chat_sse import format_side_chat_sse_event


def test_format_side_chat_sse_event_roundtrip_json() -> None:
    cid = uuid.uuid4()
    uid = uuid.uuid4()
    mid = uuid.uuid4()
    now = datetime.now(tz=UTC)
    row = SideChatMessage(
        id=mid,
        conversation_id=cid,
        seq=3,
        kind="user",
        author_user_id=uid,
        body="hello",
        referenced_event_id=None,
        referenced_note_id=None,
        referenced_side_chat_message_id=None,
        created_at=now,
        updated_at=now,
        edited_at=None,
        deleted_at=None,
    )
    frame = format_side_chat_sse_event(row)
    assert frame.startswith("data: ")
    assert frame.endswith("\n\n")
    json_part = frame.removeprefix("data: ").removesuffix("\n\n")
    obj = json.loads(json_part)
    assert obj["type"] == "side_chat"
    assert obj["message"]["seq"] == 3
    assert obj["message"]["body"] == "hello"
    assert obj["message"]["id"] == str(mid)
