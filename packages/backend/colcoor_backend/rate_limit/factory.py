"""Construct rate-limit storage from application settings."""

from __future__ import annotations

import logging

from colcoor_backend.core.config import Settings
from colcoor_backend.rate_limit.backends import InMemoryRateLimitStore, RateLimitBackend
from colcoor_backend.rate_limit.redis_backend import RedisRateLimitStore

logger = logging.getLogger(__name__)


def create_rate_limit_store(settings: Settings) -> RateLimitBackend:
    """Redis when ``REDIS_URL`` is set; in-memory for local dev without Redis."""
    url = settings.redis_url_normalized()
    if url:
        return RedisRateLimitStore(url)
    logger.info("rate limit store: REDIS_URL unset — using in-memory buckets (single process only)")
    return InMemoryRateLimitStore()
