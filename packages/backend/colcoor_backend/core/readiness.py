"""Readiness checks (database and optional Redis connectivity)."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from colcoor_backend.core.config import Settings
from colcoor_backend.services.side_chat_wake.hub import RedisSideChatWakeHub, SideChatWakeHub


async def ping_database(engine: AsyncEngine) -> None:
    """Raise if the database is not reachable (simple SELECT 1)."""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))


async def ping_redis_if_configured(settings: Settings, wake_hub: SideChatWakeHub | None) -> str:
    """Return redis readiness label; ping when URL is set (required in production)."""
    if not settings.redis_url_normalized():
        if settings.is_production():
            raise RuntimeError("REDIS_URL required in production")
        return "not_configured"
    if not isinstance(wake_hub, RedisSideChatWakeHub):
        raise RuntimeError("redis configured but wake hub is not Redis-backed")
    await wake_hub.ping()
    return "ok"
