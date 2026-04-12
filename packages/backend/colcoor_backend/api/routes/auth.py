import logging

from fastapi import APIRouter, HTTPException, status

from colcoor_backend.api.deps import DbSession, SettingsDep
from colcoor_backend.api.schemas import AuthCursorRequest, AuthResponse
from colcoor_backend.core.jwt_tokens import create_access_token
from colcoor_backend.services.cursor_identity import ProviderHint, verify_cursor_access_token
from colcoor_backend.services.graph import upsert_user_from_verified_identity

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/cursor", response_model=AuthResponse)
async def exchange_cursor_token(
    body: AuthCursorRequest,
    session: DbSession,
    settings: SettingsDep,
) -> AuthResponse:
    """Validate VS Code / Cursor IdP access token and issue a Colcoor API JWT."""
    try:
        hint = ProviderHint(body.provider_hint)
        verified = await verify_cursor_access_token(
            body.cursor_access_token,
            settings,
            hint=hint,
        )
    except ValueError:
        logger.info("cursor token exchange rejected (verification failed)")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired account token",
        ) from None

    uid = await upsert_user_from_verified_identity(session, verified)
    await session.commit()
    token = create_access_token(uid, settings)
    return AuthResponse(access_token=token)
