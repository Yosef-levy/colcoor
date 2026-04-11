"""HS256 access tokens (sub = user id)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt

from colcoor_backend.core.config import Settings


def create_access_token(user_id: uuid.UUID, settings: Settings, *, days: int = 7) -> str:
    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET is not configured")
    now = datetime.now(tz=UTC)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=days)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str, settings: Settings) -> uuid.UUID:
    if not settings.jwt_secret:
        raise jwt.InvalidTokenError("JWT_SECRET is not configured")
    payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    return uuid.UUID(str(payload["sub"]))
