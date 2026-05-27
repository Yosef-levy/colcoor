"""Construct the side-chat wake hub from application settings."""

from __future__ import annotations

import logging

from colcoor_backend.core.config import Settings
from colcoor_backend.observability.redaction import redact_string
from colcoor_backend.services.side_chat_wake.hub import (
    NullSideChatWakeHub,
    RedisSideChatWakeHub,
    SideChatWakeHub,
)

logger = logging.getLogger(__name__)


def create_side_chat_wake_hub(settings: Settings) -> SideChatWakeHub:
    url = settings.redis_url_normalized()
    if url:
        logger.info("side_chat wake hub: using Redis at %s", redact_string(url))
        return RedisSideChatWakeHub(url)
    logger.info("side_chat wake hub: REDIS_URL unset — SSE uses poll-only wakeups")
    return NullSideChatWakeHub()
