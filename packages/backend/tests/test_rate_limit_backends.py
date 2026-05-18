"""In-memory rate limit store behavior."""

from __future__ import annotations

import asyncio
import time

from colcoor_backend.rate_limit.backends import InMemoryRateLimitStore


def test_idle_buckets_purged_after_ttl() -> None:
    store = InMemoryRateLimitStore(idle_ttl_seconds=0.05)

    async def seed_and_purge() -> None:
        assert await store.allow("ip:1.2.3.4", rate=0.0, burst=10.0)
        assert "ip:1.2.3.4" in store._buckets
        time.sleep(0.06)
        # Periodic cleanup runs every 128 allow() calls.
        for _ in range(128):
            await store.allow("ip:other", rate=0.0, burst=10.0)

    asyncio.run(seed_and_purge())
    assert "ip:1.2.3.4" not in store._buckets
