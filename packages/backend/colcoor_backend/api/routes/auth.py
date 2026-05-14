import logging

from fastapi import APIRouter, HTTPException, status

from colcoor_backend.api.deps import DbSession, SettingsDep
from colcoor_backend.api.schemas import (
    AuthCursorRequest,
    AuthEmailSendRequest,
    AuthEmailSendResponse,
    AuthEmailVerifyRequest,
    AuthResponse,
)
from colcoor_backend.core.jwt_tokens import create_access_token
from colcoor_backend.services.cursor_identity import ProviderHint, verify_cursor_access_token
from colcoor_backend.services.email_login import (
    create_email_challenge,
    normalize_email,
    send_login_code_email,
    verify_email_challenge,
)
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


@router.post("/email/send-code", response_model=AuthEmailSendResponse)
async def email_send_code(
    body: AuthEmailSendRequest,
    session: DbSession,
    settings: SettingsDep,
) -> AuthEmailSendResponse:
    """Send a short-lived verification code to the given email (passwordless sign-in)."""
    email = normalize_email(str(body.email))
    try:
        challenge, code = await create_email_challenge(session, settings, email=email)
    except ValueError as e:
        if str(e) == "rate_limited_hour":
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many verification requests for this email; try again later.",
            ) from None
        if str(e) == "rate_limited_cooldown":
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Please wait before requesting another code.",
            ) from None
        raise

    try:
        await send_login_code_email(settings, to_addr=email, code=code)
    except Exception:
        logger.exception("email OTP send failed for %s", email)
        await session.delete(challenge)
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email delivery is not configured or failed; check server logs and SMTP settings.",
        ) from None

    await session.commit()
    return AuthEmailSendResponse()


@router.post("/email/verify", response_model=AuthResponse)
async def email_verify_code(
    body: AuthEmailVerifyRequest,
    session: DbSession,
    settings: SettingsDep,
) -> AuthResponse:
    """Verify the emailed code and issue a Colcoor API JWT."""
    email = normalize_email(str(body.email))
    uid = await verify_email_challenge(session, settings, email=email, code_raw=body.code)
    if uid is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired verification code",
        )
    await session.commit()
    token = create_access_token(uid, settings)
    return AuthResponse(access_token=token)
