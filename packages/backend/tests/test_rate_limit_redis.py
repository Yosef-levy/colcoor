"""Redis-backed rate limit store."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from colcoor_backend.rate_limit.redis_backend import RedisRateLimitStore


def test_redis_rate_limit_allows_until_bucket_empty() -> None:
    async def _run() -> None:
        store = RedisRateLimitStore("redis://127.0.0.1:6379/0")
        store._redis = MagicMock()
        store._redis.eval = AsyncMock(side_effect=[1, 1, 0])

        assert await store.allow("user:abc", rate=0.0, burst=2.0) is True
        assert await store.allow("user:abc", rate=0.0, burst=2.0) is True
        assert await store.allow("user:abc", rate=0.0, burst=2.0) is False
        assert store._redis.eval.await_count == 3

    asyncio.run(_run())


def test_redis_rate_limit_fail_open_on_redis_error() -> None:
    async def _run() -> None:
        store = RedisRateLimitStore("redis://127.0.0.1:6379/0")
        store._redis = MagicMock()
        store._redis.eval = AsyncMock(side_effect=ConnectionError("down"))

        assert await store.allow("ip:1.2.3.4", rate=1.0, burst=1.0) is True

    asyncio.run(_run())
