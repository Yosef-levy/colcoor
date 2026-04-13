"""Caller profile updates (api-contracts §9.1)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from colcoor_backend.api.schemas import MePatchBody
from colcoor_backend.db.models import User


async def get_me_user(session: AsyncSession, user_id: UUID) -> User | None:
    """Return the caller’s user row, if it exists."""
    return await session.get(User, user_id)


async def patch_me(session: AsyncSession, user_id: UUID, body: MePatchBody) -> User:
    """Apply PATCH fields; commits and returns refreshed user."""
    user = await session.get(User, user_id)
    if user is None:
        raise ValueError("user not found")

    data = body.model_dump(exclude_unset=True)
    if "display_name" in data:
        user.display_name = "" if data["display_name"] is None else str(data["display_name"])
    if "avatar_url" in data:
        user.avatar_url = data["avatar_url"]

    await session.commit()
    await session.refresh(user)
    return user
