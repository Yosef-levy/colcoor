from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from colcoor_backend.core.config import Settings, get_settings
from colcoor_backend.core.jwt_tokens import decode_access_token


async def bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    """Require Authorization: Bearer <token> on protected routes (docs/monetization.md)."""
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Empty bearer token",
        )
    return token


BearerToken = Annotated[str, Depends(bearer_token)]


def settings_dep() -> Settings:
    return get_settings()


SettingsDep = Annotated[Settings, Depends(settings_dep)]


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    factory = getattr(request.app.state, "session_factory", None)
    if factory is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not configured",
        )
    async with factory() as session:
        yield session


DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user_id(
    request: Request,
    token: BearerToken,
    settings: SettingsDep,
) -> uuid.UUID:
    try:
        user_id = decode_access_token(token, settings)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from None
    uid = str(user_id)
    request.state.user_id = uid
    from colcoor_backend.observability import context as obs_ctx

    obs_ctx.user_id_ctx.set(uid)
    return user_id


CurrentUserId = Annotated[uuid.UUID, Depends(get_current_user_id)]
