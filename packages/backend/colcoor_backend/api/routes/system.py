"""System / deployment metadata (authenticated)."""

from fastapi import APIRouter

from colcoor_backend.api.deps import CurrentUserId, DbSession, SettingsDep
from colcoor_backend.api.schemas import LicenseStatusResponse
from colcoor_backend.licensing.service import get_license_status

router = APIRouter()


@router.get("/license", response_model=LicenseStatusResponse)
async def license_status(
    _user_id: CurrentUserId,
    session: DbSession,
    settings: SettingsDep,
) -> LicenseStatusResponse:
    """Safe license summary for admins (no raw license key)."""
    status = await get_license_status(session, settings)
    return LicenseStatusResponse(
        license_type=status.license_type,
        deployment_profile=status.deployment_profile,
        max_users=status.max_users,
        current_users=status.current_users,
        license_key_present=status.license_key_present,
    )
