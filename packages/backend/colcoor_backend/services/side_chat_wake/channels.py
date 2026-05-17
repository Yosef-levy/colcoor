"""Redis channel naming for side-chat SSE wakeups.

One channel per conversation so each SSE stream subscribes only to its thread.
Payloads are wake hints (seq optional); message bodies always come from Postgres.
"""

from __future__ import annotations

import json
import uuid

# Prefix keeps keys namespaced on shared Redis instances.
SIDE_CHAT_REDIS_PREFIX = "colcoor:side_chat:"


def side_chat_redis_channel(conversation_id: uuid.UUID) -> str:
    """Channel for ``PUBLISH`` / ``SUBSCRIBE`` on a single conversation."""
    return f"{SIDE_CHAT_REDIS_PREFIX}{conversation_id}"


def encode_wake_payload(*, seq: int) -> str:
    """Minimal JSON hint: receivers re-query ``side_chat_messages`` by seq."""
    return json.dumps({"s": seq}, separators=(",", ":"))
