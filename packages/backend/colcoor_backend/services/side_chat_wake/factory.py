"""Construct the side-chat wake hub from application settings."""

from __future__ import annotations

import logging

from colcoor_backend.core.config import Settings
from colcoor_backend.services.side_chat_wake.hub import (
    NullSideChatWakeHub,
    RedisSideChatWakeHub,
    SideChatWakeHub,
)

logger = logging.getLogger(__name__)


def create_side_chat_wake_hub(settings: Settings) -> SideChatWakeHub:
    url = settings.redis_url_normalized()
    if url:
        logger.info("side_chat wake hub: using Redis at %s", _redact_redis_url(url))
        return RedisSideChatWakeHub(url)
    logger.info("side_chat wake hub: REDIS_URL unset — SSE uses poll-only wakeups")
    return NullSideChatWakeHub()


def _redact_redis_url(url: str) -> str:
    """Hide password in logs (redis://:secret@host:6379/0)."""
    if "@" not in url:
        return url
    scheme, rest = url.split("://", 1) if "://" in url else ("", url)
    if "@" in rest:
        creds, hostpart = rest.rsplit("@", 1)
        if ":" in creds:
            user = creds.split(":", 1)[0]
            creds = f"{user}:***"
        else:
            creds = "***"
        return f"{scheme}://{creds}@{hostpart}" if scheme else f"{creds}@{hostpart}"
    return url
