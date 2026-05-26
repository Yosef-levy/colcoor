"""Redis-backed cluster-wide token bucket rate limiting."""

from __future__ import annotations

import logging
import math
import time

import redis.asyncio as aioredis

from colcoor_backend.observability.metrics import RATE_LIMIT_REJECTED_TOTAL

logger = logging.getLogger(__name__)

_KEY_PREFIX = "colcoor:ratelimit:"

# Atomic token-bucket check/set (wall-clock seconds for cross-process consistency).
_TOKEN_BUCKET_LUA = """
local key = KEYS[1]
local rate = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local amount = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

local tokens_s = redis.call('HGET', key, 'tokens')
local last_s = redis.call('HGET', key, 'last_update')

local tokens
local last_update
if tokens_s == false then
  tokens = capacity
  last_update = now
else
  tokens = tonumber(tokens_s)
  last_update = tonumber(last_s)
  local elapsed = now - last_update
  if rate > 0 and elapsed > 0 then
    tokens = math.min(capacity, tokens + elapsed * rate)
  end
  last_update = now
end

if tokens >= amount then
  tokens = tokens - amount
  redis.call('HSET', key, 'tokens', tokens, 'last_update', last_update)
  redis.call('EXPIRE', key, ttl)
  return 1
end

redis.call('HSET', key, 'tokens', tokens, 'last_update', last_update)
redis.call('EXPIRE', key, ttl)
return 0
"""


class RedisRateLimitStore:
    """Cluster-wide token buckets in Redis (one key per rate-limit subject)."""

    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url
        self._redis: aioredis.Redis | None = None
        self._script = _TOKEN_BUCKET_LUA

    async def start(self) -> None:
        self._redis = aioredis.from_url(
            self._redis_url,
            decode_responses=True,
            health_check_interval=30,
        )
        logger.info("rate limit store: Redis token buckets enabled")

    async def stop(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None

    async def ping(self) -> None:
        if self._redis is None:
            raise RuntimeError("redis rate limit client not started")
        await self._redis.ping()

    async def allow(self, key: str, *, rate: float, burst: float) -> bool:
        if self._redis is None:
            raise RuntimeError("redis rate limit client not started")
        cap = max(float(burst), 1.0)
        r = max(float(rate), 0.0)
        now = time.time()
        # Idle bucket expiry: time to refill from empty plus headroom.
        ttl = int(math.ceil(cap / max(r, 0.001)) + 3600)
        redis_key = f"{_KEY_PREFIX}{key}"
        try:
            allowed = await self._redis.eval(
                self._script,
                1,
                redis_key,
                str(r),
                str(cap),
                str(now),
                "1.0",
                str(ttl),
            )
        except Exception:
            logger.exception("rate limit redis eval failed key=%s", key.split(":", 1)[0])
            # Fail open so Redis blips do not hard-block API traffic.
            return True
        if allowed == 1:
            return True
        key_type = key.split(":", 1)[0] if ":" in key else "unknown"
        RATE_LIMIT_REJECTED_TOTAL.labels(key_type=key_type).inc()
        return False
