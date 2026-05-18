"""License enforcement and status (seat limits; offline/env today)."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from colcoor_backend.core.config import Settings
from colcoor_backend.db.models import User
from colcoor_backend.licensing.exceptions import LicenseUserLimitReached


@dataclass(frozen=True)
class LicenseStatus:
    license_type: str
    deployment_profile: str
    max_users: int
    current_users: int
    license_key_present: bool


async def count_users(session: AsyncSession) -> int:
    result = await session.execute(select(func.count()).select_from(User))
    return int(result.scalar_one() or 0)


def check_can_register_new_user(current_users: int, settings: Settings) -> None:
    """Block only net-new users; existing accounts may still sign in when over limit."""
    max_users = settings.resolved_license_max_users()
    if max_users > 0 and current_users >= max_users:
        raise LicenseUserLimitReached(
            f"This Colcoor instance allows up to {max_users} users "
            f"({settings.license_type_normalized()} license). "
            "Upgrade your license or sign in with an existing account."
        )


async def assert_can_register_new_user(session: AsyncSession, settings: Settings) -> None:
    current = await count_users(session)
    check_can_register_new_user(current, settings)


async def get_license_status(session: AsyncSession, settings: Settings) -> LicenseStatus:
    current = await count_users(session)
    return LicenseStatus(
        license_type=settings.license_type_normalized(),
        deployment_profile=settings.deployment_profile_normalized(),
        max_users=settings.resolved_license_max_users(),
        current_users=current,
        license_key_present=settings.license_key_present(),
    )
