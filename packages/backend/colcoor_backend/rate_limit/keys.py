"""Derive rate-limit keys from requests."""

from __future__ import annotations

import jwt
from starlette.requests import Request

from colcoor_backend.core.config import Settings
from colcoor_backend.core.jwt_tokens import decode_access_token


def _client_ip(request: Request, settings: Settings) -> str:
    """
    Client IP for anonymous buckets.

    ``X-Forwarded-For`` is used only when ``RATE_LIMIT_TRUST_PROXY=true`` (expected
    behind nginx in production). Direct API access must leave this false so clients
    cannot pick arbitrary rate-limit keys.
    """
    if settings.rate_limit_trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            client = forwarded.split(",")[0].strip()
            if client:
                return client
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def rate_limit_key(request: Request, settings: Settings) -> str:
    """
    Authenticated: ``user:{uuid}`` from JWT ``sub``.
    Otherwise: ``ip:{client host}`` (corporate NAT shares one bucket).
    """
    authorization = request.headers.get("authorization")
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        if token:
            try:
                user_id = decode_access_token(token, settings)
                return f"user:{user_id}"
            except (jwt.PyJWTError, ValueError, RuntimeError):
                pass
    return f"ip:{_client_ip(request, settings)}"
