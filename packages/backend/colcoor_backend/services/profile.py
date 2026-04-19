"""Caller profile updates (api-contracts §9.1)."""

from __future__ import annotations

import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from colcoor_backend.api.schemas import MePatchBody
from colcoor_backend.db.models import User

_PUBLIC_HANDLE_RE = re.compile(r"^[a-zA-Z0-9_.-]{1,200}$")


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
    if "handle" in data:
        raw = data["handle"]
        if raw is None:
            user.handle = None
        else:
            h = str(raw).strip()
            if not _PUBLIC_HANDLE_RE.match(h):
                raise ValueError("invalid handle: use letters, digits, and ._- only (max 200 chars)")
            res = await session.execute(select(User.id).where(User.handle == h, User.id != user_id))
            if res.scalar_one_or_none() is not None:
                raise ValueError("handle already taken")
            user.handle = h

    await session.commit()
    await session.refresh(user)
    return user
