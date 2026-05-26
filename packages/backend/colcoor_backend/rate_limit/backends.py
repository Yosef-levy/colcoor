"""Rate-limit storage backends (in-memory today; Redis later)."""

from __future__ import annotations

import asyncio
import time
from typing import Protocol

from colcoor_backend.observability.metrics import RATE_LIMIT_REJECTED_TOTAL
from colcoor_backend.rate_limit.token_bucket import TokenBucket

# Evict buckets idle longer than this (limits memory growth across many users/IPs).
DEFAULT_BUCKET_IDLE_TTL_SECONDS = 3600.0
_CLEANUP_EVERY_N_CHECKS = 128


class RateLimitBackend(Protocol):
    """Check whether a request is allowed under a token-bucket limit."""

    async def allow(self, key: str, *, rate: float, burst: float) -> bool:
        """Return True if the request may proceed, False if rate limited."""


class InMemoryRateLimitStore:
    """Per-process token buckets keyed by ``user:{uuid}`` or ``ip:{host}``."""

    def __init__(self, *, idle_ttl_seconds: float = DEFAULT_BUCKET_IDLE_TTL_SECONDS) -> None:
        self._buckets: dict[str, TokenBucket] = {}
        self._lock = asyncio.Lock()
        self._idle_ttl = idle_ttl_seconds
        self._checks_since_cleanup = 0

    async def allow(self, key: str, *, rate: float, burst: float) -> bool:
        async with self._lock:
            self._maybe_purge_idle_buckets()
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = TokenBucket.create(rate=rate, capacity=burst)
                self._buckets[key] = bucket
            else:
                bucket.configure(rate=rate, capacity=burst)
            if bucket.try_consume(1.0):
                return True
            key_type = key.split(":", 1)[0] if ":" in key else "unknown"
            RATE_LIMIT_REJECTED_TOTAL.labels(key_type=key_type).inc()
            return False

    def _maybe_purge_idle_buckets(self) -> None:
        self._checks_since_cleanup += 1
        if self._checks_since_cleanup < _CLEANUP_EVERY_N_CHECKS:
            return
        self._checks_since_cleanup = 0
        cutoff = time.monotonic() - self._idle_ttl
        stale = [key for key, bucket in self._buckets.items() if bucket.last_access < cutoff]
        for key in stale:
            del self._buckets[key]
