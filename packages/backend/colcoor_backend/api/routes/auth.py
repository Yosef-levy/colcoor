from fastapi import APIRouter, HTTPException, status

from colcoor_backend.api.deps import DbSession, SettingsDep
from colcoor_backend.api.schemas import AuthCursorRequest, AuthResponse, DevLoginRequest
from colcoor_backend.core.jwt_tokens import create_access_token
from colcoor_backend.services.graph import upsert_user_by_cursor_sub

router = APIRouter()


@router.post("/dev-login", response_model=AuthResponse)
async def dev_login(
    body: DevLoginRequest,
    session: DbSession,
    settings: SettingsDep,
) -> AuthResponse:
    """Non-production only: provision or update user by cursor_sub and return API JWT."""
    if settings.is_production():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="dev-login disabled in production")
    uid = await upsert_user_by_cursor_sub(
        session,
        cursor_sub=body.cursor_sub.strip(),
        email=body.email.strip(),
        display_name=body.display_name.strip(),
    )
    await session.commit()
    token = create_access_token(uid, settings)
    return AuthResponse(access_token=token)


@router.post("/cursor", response_model=AuthResponse)
async def exchange_cursor_token(
    _body: AuthCursorRequest,
) -> AuthResponse:
    """Validate Cursor token and issue backend JWT (docs/authentication.md §3)."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="POST /auth/cursor not implemented; use /auth/dev-login when COLCOOR_ENV is not production",
    )
