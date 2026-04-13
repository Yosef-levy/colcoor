from fastapi import APIRouter, HTTPException, status

from colcoor_backend.api.deps import CurrentUserId, DbSession
from colcoor_backend.api.schemas import MeOut, MePatchBody
from colcoor_backend.services.profile import patch_me

router = APIRouter()


@router.patch("", response_model=MeOut, response_model_exclude_none=True)
async def patch_me_route(
    session: DbSession,
    user_id: CurrentUserId,
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
    )
