from fastapi import APIRouter, HTTPException, status

from colcoor_backend.api.deps import CurrentUserId, DbSession
from colcoor_backend.api.schemas import MeOut, MePatchBody
from colcoor_backend.services.profile import get_me_user, patch_me

router = APIRouter()


@router.get("", response_model=MeOut, response_model_exclude_none=True)
async def get_me_route(user_id: CurrentUserId, session: DbSession) -> MeOut:
    """Return the authenticated user’s profile (same shape as PATCH …/me)."""
    user = await get_me_user(session, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    return MeOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        handle=user.handle,
    )


@router.patch("", response_model=MeOut, response_model_exclude_none=True)
async def patch_me_route(
    user_id: CurrentUserId,
    session: DbSession,
    body: MePatchBody,
) -> MeOut:
    try:
        user = await patch_me(session, user_id, body)
    except ValueError as e:
        if str(e) == "user not found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found") from e
        raise
    return MeOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        handle=user.handle,
    )
