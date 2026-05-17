"""Side-chat Redis wake hub (channels, null hub, multiplexing, cleanup)."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock
import uuid

import pytest

from colcoor_backend.core.config import get_settings
from colcoor_backend.core.validation import validate_production_settings
from colcoor_backend.services.side_chat_wake.channels import (
    encode_wake_payload,
    side_chat_redis_channel,
)
from colcoor_backend.services.side_chat_wake.hub import NullSideChatWakeHub, RedisSideChatWakeHub


def test_side_chat_redis_channel_format() -> None:
    cid = uuid.UUID("00000000-0000-4000-8000-000000000001")
    assert side_chat_redis_channel(cid) == "colcoor:side_chat:00000000-0000-4000-8000-000000000001"


def test_encode_wake_payload() -> None:
    assert encode_wake_payload(seq=42) == '{"s":42}'


def test_null_hub_subscribe_never_wakes() -> None:
    async def _run() -> None:
        hub = NullSideChatWakeHub()
        await hub.start()
        cid = uuid.uuid4()
        async with hub.subscribe(cid) as wake:
            await hub.publish(cid, seq=1)
            try:
                await asyncio.wait_for(wake.wait(), timeout=0.05)
            except asyncio.TimeoutError:
                pass
            else:
                pytest.fail("null hub should not set wake event")
        await hub.stop()

    asyncio.run(_run())


def test_production_requires_redis_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COLCOOR_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "a" * 40)
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://u:VeryLongRandomPassw0rdxxxxxxxxxxxx@postgres:5432/db",
    )
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.delenv("COLCOOR_REDIS_URL", raising=False)
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="REDIS_URL"):
        validate_production_settings(get_settings())
    get_settings.cache_clear()


def _make_hub_with_mock_pubsub() -> tuple[RedisSideChatWakeHub, AsyncMock]:
    hub = RedisSideChatWakeHub("redis://127.0.0.1:6379/0")
    pubsub = AsyncMock()
    pubsub.subscribe = AsyncMock()
    pubsub.unsubscribe = AsyncMock()
    pubsub.aclose = AsyncMock()
    hub._redis = MagicMock()
    hub._pubsub = pubsub
    return hub, pubsub


def test_redis_hub_multiplex_subscribe_one_redis_channel() -> None:
    async def _run() -> None:
        hub, pubsub = _make_hub_with_mock_pubsub()
        cid = uuid.uuid4()
        channel = side_chat_redis_channel(cid)

        async with hub.subscribe(cid):
            assert pubsub.subscribe.await_count == 1
            assert pubsub.subscribe.await_args.args[0] == channel

            async with hub.subscribe(cid):
                assert pubsub.subscribe.await_count == 1

        assert channel not in hub._subscribed_channels
        assert pubsub.unsubscribe.await_count == 1
        assert pubsub.unsubscribe.await_args.args[0] == channel

    asyncio.run(_run())


def test_redis_hub_unsubscribe_only_when_last_sse_leaves() -> None:
    async def _run() -> None:
        hub, pubsub = _make_hub_with_mock_pubsub()
        cid = uuid.uuid4()

        cm_a = hub.subscribe(cid)
        cm_b = hub.subscribe(cid)
        a = await cm_a.__aenter__()
        await cm_b.__aenter__()
        pubsub.unsubscribe.reset_mock()

        await cm_a.__aexit__(None, None, None)
        pubsub.unsubscribe.assert_not_called()

        await cm_b.__aexit__(None, None, None)
        assert pubsub.unsubscribe.await_count == 1
        del a

    asyncio.run(_run())


def test_redis_hub_subscribe_failure_does_not_leak_waiter() -> None:
    async def _run() -> None:
        hub, pubsub = _make_hub_with_mock_pubsub()
        pubsub.subscribe.side_effect = ConnectionError("redis down")
        cid = uuid.uuid4()
        channel = side_chat_redis_channel(cid)

        with pytest.raises(ConnectionError):
            async with hub.subscribe(cid):
                pass

        assert channel not in hub._waiters
        assert channel not in hub._subscribed_channels

    asyncio.run(_run())


def test_redis_hub_dispatch_wakes_all_local_sse_waiters() -> None:
    async def _run() -> None:
        hub, _pubsub = _make_hub_with_mock_pubsub()
        cid = uuid.uuid4()
        channel = side_chat_redis_channel(cid)

        async with hub.subscribe(cid) as wake_a:
            async with hub.subscribe(cid) as wake_b:
                hub._dispatch(channel)
                await asyncio.wait_for(wake_a.wait(), timeout=0.1)
                await asyncio.wait_for(wake_b.wait(), timeout=0.1)

    asyncio.run(_run())


def test_redis_hub_publish_swallows_errors() -> None:
    async def _run() -> None:
        hub, _pubsub = _make_hub_with_mock_pubsub()
        hub._redis.publish = AsyncMock(side_effect=ConnectionError("down"))
        await hub.publish(uuid.uuid4(), seq=1)

    asyncio.run(_run())


def test_redis_hub_stop_cancels_listener_task() -> None:
    async def _run() -> None:
        hub, _pubsub = _make_hub_with_mock_pubsub()

        async def _fake_listen():
            try:
                while True:
                    await asyncio.sleep(3600)
            except asyncio.CancelledError:
                raise

        hub._pubsub.listen = _fake_listen
        listener = asyncio.create_task(hub._listen_loop())
        hub._listener_task = listener
        await hub.stop()
        assert listener.done()
        assert hub._redis is None

    asyncio.run(_run())


def test_redis_hub_publish_subscribe_integration() -> None:
    """Requires Redis on localhost:6379 (skipped when unavailable)."""
    import redis.asyncio as aioredis

    async def _run() -> None:
        try:
            probe = aioredis.from_url("redis://127.0.0.1:6379/0", decode_responses=True)
            await probe.ping()
            await probe.aclose()
        except Exception:
            pytest.skip("redis not available on 127.0.0.1:6379")

        hub = RedisSideChatWakeHub("redis://127.0.0.1:6379/0")
        await hub.start()
        try:
            cid = uuid.uuid4()
            async with hub.subscribe(cid) as wake:
                await hub.publish(cid, seq=7)
                await asyncio.wait_for(wake.wait(), timeout=2.0)
        finally:
            await hub.stop()

    asyncio.run(_run())
