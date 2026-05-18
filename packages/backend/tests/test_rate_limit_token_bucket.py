"""Unit tests for the token bucket."""

from __future__ import annotations

from colcoor_backend.rate_limit.token_bucket import TokenBucket


def test_burst_then_refill() -> None:
    bucket = TokenBucket.create(rate=10.0, capacity=2.0)
    assert bucket.try_consume()
    assert bucket.try_consume()
    assert not bucket.try_consume()
