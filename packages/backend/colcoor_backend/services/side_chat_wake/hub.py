"""In-process fan-out from Redis pub/sub to local SSE waiters.

Architecture
------------
* **Publishers** (REST handlers after commit) call ``publish`` → one Redis ``PUBLISH``
  per message change, on a per-conversation channel.
* **Subscribers** (SSE streams) register a local ``asyncio.Event`` via ``subscribe``;
  this process holds **at most one** Redis ``SUBSCRIBE`` per active conversation,
  no matter how many SSE clients watch that conversation.
* **Payload** is only a wakeup hint; SSE always re-reads Postgres (unchanged contract).

When ``REDIS_URL`` is unset, ``NullSideChatWakeHub`` makes publish a no-op and SSE
falls back to timed polling (same as the old poll-only mode).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections import defaultdict
from collections.abc import AsyncIterator
from typing import Protocol, runtime_checkable
import uuid

import redis.asyncio as aioredis
from redis.asyncio.client import PubSub

from colcoor_backend.services.side_chat_wake.channels import (
    encode_wake_payload,
    side_chat_redis_channel,
)
from colcoor_backend.observability.metrics import (
    REDIS_LISTENER_ERRORS_TOTAL,
    REDIS_LISTENER_RECONNECTS_TOTAL,
    REDIS_PUBLISH_TOTAL,
    REDIS_SSE_WAITERS,
    REDIS_SUBSCRIBED_CHANNELS,
)

logger = logging.getLogger(__name__)


@runtime_checkable
class SideChatWakeHub(Protocol):
    """Transport-agnostic wakeup bus for idle side-chat SSE streams."""

    async def start(self) -> None: ...

    async def stop(self) -> None: ...

    async def publish(self, conversation_id: uuid.UUID, *, seq: int) -> None: ...

    @contextlib.asynccontextmanager
    async def subscribe(self, conversation_id: uuid.UUID) -> AsyncIterator[asyncio.Event]:
        """Yield a local event set when this conversation may have new rows."""
        ...


class NullSideChatWakeHub:
    """Poll-only: no cross-replica wakeups (development without Redis)."""

    async def start(self) -> None:
        return None

    async def stop(self) -> None:
        return None

    async def publish(self, conversation_id: uuid.UUID, *, seq: int) -> None:
        del conversation_id, seq

    @contextlib.asynccontextmanager
    async def subscribe(self, conversation_id: uuid.UUID) -> AsyncIterator[asyncio.Event]:
        del conversation_id
        yield asyncio.Event()


class RedisSideChatWakeHub:
    """Redis pub/sub with per-process subscription multiplexing."""

    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url
        self._redis: aioredis.Redis | None = None
        self._pubsub: PubSub | None = None
        self._listener_task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()
        # channel name -> list of waiter events on this worker
        self._waiters: dict[str, list[asyncio.Event]] = defaultdict(list)
        self._subscribed_channels: set[str] = set()

    async def start(self) -> None:
        self._redis = aioredis.from_url(
            self._redis_url,
            decode_responses=True,
            health_check_interval=30,
        )
        self._pubsub = self._redis.pubsub()
        self._listener_task = asyncio.create_task(
            self._listen_loop(), name="side_chat_redis_listen"
        )
        logger.info("side_chat wake hub: Redis listener started")

    async def stop(self) -> None:
        if self._listener_task is not None:
            self._listener_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._listener_task
            self._listener_task = None
        if self._pubsub is not None:
            with contextlib.suppress(Exception):
                await self._pubsub.aclose()
            self._pubsub = None
        if self._redis is not None:
            with contextlib.suppress(Exception):
                await self._redis.aclose()
            self._redis = None
        self._waiters.clear()
        self._subscribed_channels.clear()
        logger.info("side_chat wake hub: Redis listener stopped")

    async def publish(self, conversation_id: uuid.UUID, *, seq: int) -> None:
        if self._redis is None:
            return
        channel = side_chat_redis_channel(conversation_id)
        try:
            await self._redis.publish(channel, encode_wake_payload(seq=seq))
            REDIS_PUBLISH_TOTAL.labels(result="ok").inc()
        except Exception:
            REDIS_PUBLISH_TOTAL.labels(result="error").inc()
            logger.exception("side_chat wake hub: publish failed channel=%s", channel)

    @contextlib.asynccontextmanager
    async def subscribe(self, conversation_id: uuid.UUID) -> AsyncIterator[asyncio.Event]:
        channel = side_chat_redis_channel(conversation_id)
        wake = asyncio.Event()
        async with self._lock:
            self._waiters[channel].append(wake)
            try:
                if channel not in self._subscribed_channels:
                    await self._ensure_subscribed(channel)
            except Exception:
                self._waiters[channel].remove(wake)
                if not self._waiters[channel]:
                    del self._waiters[channel]
                raise
            self.refresh_observability_metrics()
        try:
            yield wake
        finally:
            async with self._lock:
                waiters = self._waiters.get(channel)
                if waiters is not None:
                    with contextlib.suppress(ValueError):
                        waiters.remove(wake)
                    if not waiters:
                        del self._waiters[channel]
                        await self._unsubscribe_channel(channel)
            self.refresh_observability_metrics()

    def refresh_observability_metrics(self) -> None:
        """Update Prometheus gauges (call before /metrics scrape)."""
        REDIS_SUBSCRIBED_CHANNELS.set(len(self._subscribed_channels))
        REDIS_SSE_WAITERS.set(sum(len(waiters) for waiters in self._waiters.values()))

    async def ping(self) -> None:
        if self._redis is None:
            raise RuntimeError("redis client not started")
        await self._redis.ping()

    async def _ensure_subscribed(self, channel: str) -> None:
        if self._pubsub is None:
            raise RuntimeError("pubsub not started")
        await self._pubsub.subscribe(channel)
        self._subscribed_channels.add(channel)

    async def _unsubscribe_channel(self, channel: str) -> None:
        if self._pubsub is None or channel not in self._subscribed_channels:
            return
        with contextlib.suppress(Exception):
            await self._pubsub.unsubscribe(channel)
        self._subscribed_channels.discard(channel)

    async def _resubscribe_all(self) -> None:
        """After connection loss, rebuild pubsub and reattach channel subscriptions."""
        async with self._lock:
            if self._redis is None:
                return
            channels = list(self._subscribed_channels)
            self._subscribed_channels.clear()
            if self._pubsub is not None:
                with contextlib.suppress(Exception):
                    await self._pubsub.aclose()
            self._pubsub = self._redis.pubsub()
            for channel in channels:
                try:
                    await self._pubsub.subscribe(channel)
                    self._subscribed_channels.add(channel)
                except Exception:
                    logger.exception(
                        "side_chat wake hub: resubscribe failed channel=%s", channel
                    )

    def _dispatch(self, channel: str) -> None:
        for ev in self._waiters.get(channel, ()):
            ev.set()

    async def _listen_loop(self) -> None:
        assert self._pubsub is not None
        backoff = 0.25
        while True:
            try:
                async for message in self._pubsub.listen():
                    if message is None:
                        continue
                    if message.get("type") != "message":
                        continue
                    channel = message.get("channel")
                    if isinstance(channel, str):
                        self._dispatch(channel)
                # listen() ended without exception (connection dropped / pubsub closed)
                logger.warning("side_chat wake hub: pubsub listen ended, reconnecting")
            except asyncio.CancelledError:
                raise
            except Exception:
                REDIS_LISTENER_ERRORS_TOTAL.inc()
                logger.exception(
                    "side_chat wake hub: listener error, reconnecting in %.2fs", backoff
                )
            REDIS_LISTENER_RECONNECTS_TOTAL.inc()
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 5.0)
            try:
                await self._resubscribe_all()
                backoff = 0.25
            except Exception:
                logger.exception("side_chat wake hub: resubscribe after error failed")
