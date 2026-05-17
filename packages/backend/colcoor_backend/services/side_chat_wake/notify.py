"""Publish side-chat change hints after successful DB commits."""

from __future__ import annotations

import uuid

from colcoor_backend.services.side_chat_wake.hub import SideChatWakeHub


async def notify_side_chat_changed(
    hub: SideChatWakeHub | None,
    conversation_id: uuid.UUID,
    *,
    seq: int,
) -> None:
    """Wake SSE streams on all backend replicas (no-op when Redis is not configured)."""
    if hub is None:
        return
    await hub.publish(conversation_id, seq=seq)
