"""In-process token bucket (one bucket per rate-limit key)."""

from __future__ import annotations

import time
from dataclasses import dataclass


@dataclass
class TokenBucket:
    """Classic token bucket: refill at ``rate`` tokens/s up to ``capacity``."""

    rate: float
    capacity: float
    tokens: float
    last_update: float
    last_access: float

    @classmethod
    def create(cls, *, rate: float, capacity: float) -> TokenBucket:
        cap = max(capacity, 1.0)
        now = time.monotonic()
        return cls(
            rate=max(rate, 0.0),
            capacity=cap,
            tokens=cap,
            last_update=now,
            last_access=now,
        )

    def configure(self, *, rate: float, capacity: float) -> None:
        self.rate = max(rate, 0.0)
        self.capacity = max(capacity, 1.0)
        self.tokens = min(self.tokens, self.capacity)

    def try_consume(self, amount: float = 1.0) -> bool:
        now = time.monotonic()
        self.last_access = now
        elapsed = now - self.last_update
        self.last_update = now
        if self.rate > 0 and elapsed > 0:
            self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        if self.tokens >= amount:
            self.tokens -= amount
            return True
        return False
