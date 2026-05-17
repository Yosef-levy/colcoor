"""Readiness checks (database, Redis, image storage)."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from colcoor_backend.core.config import Settings
from colcoor_backend.services.side_chat_wake.hub import RedisSideChatWakeHub, SideChatWakeHub
from colcoor_backend.storage.gcs import GcsImageBlobStorage
from colcoor_backend.storage.local import LocalImageBlobStorage
from colcoor_backend.storage.protocol import ImageBlobStorage


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


async def ping_image_storage(settings: Settings, storage: ImageBlobStorage | None) -> str:
    """Verify configured image backend (GCS bucket or local directory)."""
    backend = settings.resolved_image_storage_backend()
    if backend == "local":
        if storage is None or not isinstance(storage, LocalImageBlobStorage):
            raise RuntimeError("local image storage not initialized")
        await storage.ping()
        return "ok"
    if backend == "gcs":
        if settings.is_production() and not settings.gcs_bucket_normalized():
            raise RuntimeError("GCS_BUCKET required in production")
        if not settings.gcs_bucket_normalized():
            return "not_configured"
        if storage is None or not isinstance(storage, GcsImageBlobStorage):
            raise RuntimeError("GCS image storage not initialized")
        await storage.ping()
        return "ok"
    raise RuntimeError(f"unknown image storage backend: {backend}")
