"""Send and verify email one-time codes for Colcoor JWT issuance."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import re
import secrets
import smtplib
import uuid
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from colcoor_backend.core.config import Settings
from colcoor_backend.db.models import EmailLoginChallenge, User

logger = logging.getLogger(__name__)

_CODE_RE = re.compile(r"^\s*(\d{6})\s*$")

# Throttle: max challenges created per email per rolling hour
_MAX_SENDS_PER_HOUR = 10
# Minimum seconds between sends for the same email
_MIN_SECONDS_BETWEEN_SENDS = 60


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _code_hash(settings: Settings, email: str, code: str) -> str:
    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET is not configured")
    msg = f"{email}:{code}".encode("utf-8")
    return hmac.new(settings.jwt_secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def _generate_six_digit_code() -> str:
    n = secrets.randbelow(1_000_000)
    return f"{n:06d}"


def _parse_code(raw: str) -> str | None:
    m = _CODE_RE.match(raw or "")
    return m.group(1) if m else None


def _send_smtp_sync(settings: Settings, *, to_addr: str, subject: str, body: str) -> None:
    host = (settings.smtp_host or "").strip()
    if not host:
        raise RuntimeError("SMTP is not configured (smtp_host empty)")
    port = int(settings.smtp_port)
    user = (settings.smtp_user or "").strip()
    password = settings.smtp_password or ""
    from_addr = (settings.smtp_from or "").strip() or user
    if not from_addr:
        raise RuntimeError("smtp_from or smtp_user must be set")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.set_content(body)

    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=30) as smtp:
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)


async def send_login_code_email(settings: Settings, *, to_addr: str, code: str) -> None:
    """Deliver the OTP by SMTP, or log when explicitly enabled for development."""
    if settings.email_login_log_codes:
        logger.warning(
            "email login code (dev only; email_login_log_codes=true) to=%s code=%s",
            to_addr,
            code,
        )
        return
    host = (settings.smtp_host or "").strip()
    if not host:
        raise RuntimeError(
            "Email login is not configured: set SMTP_* env vars, or enable "
            "COLCOOR_EMAIL_LOGIN_LOG_CODES=true for development only.",
        )
    subject = "Your Colcoor verification code"
    body = (
        f"Your Colcoor verification code is: {code}\n\n"
        "It expires in a few minutes. If you did not request this, ignore this email.\n"
    )
    await asyncio.to_thread(_send_smtp_sync, settings, to_addr=to_addr, subject=subject, body=body)


async def ensure_user_for_email(session: AsyncSession, email: str) -> uuid.UUID:
    """Find user by email (case-insensitive) or create one with a colcoor_email:* cursor_sub."""
    now = datetime.now(tz=UTC)
    res = await session.execute(select(User).where(func.lower(User.email) == email))
    user = res.scalar_one_or_none()
    if user:
        user.last_login_at = now
        await session.flush()
        await session.refresh(user)
        return user.id
    user = User(
        email=email,
        display_name="",
        cursor_sub=f"colcoor_email:{uuid.uuid4()}",
        avatar_url=None,
        last_login_at=now,
    )
    session.add(user)
    await session.flush()
    await session.refresh(user)
    return user.id


async def create_email_challenge(
    session: AsyncSession,
    settings: Settings,
    *,
    email: str,
) -> tuple[EmailLoginChallenge, str]:
    """Insert a new challenge, invalidate older pending rows for this email; return row + plaintext code."""
    now = datetime.now(tz=UTC)
    res = await session.execute(
        select(func.count())
        .select_from(EmailLoginChallenge)
        .where(
            EmailLoginChallenge.email == email,
            EmailLoginChallenge.created_at > now - timedelta(hours=1),
        )
    )
    count_last_hour = int(res.scalar_one() or 0)
    if count_last_hour >= _MAX_SENDS_PER_HOUR:
        raise ValueError("rate_limited_hour")

    res2 = await session.execute(
        select(EmailLoginChallenge.created_at)
        .where(EmailLoginChallenge.email == email)
        .order_by(EmailLoginChallenge.created_at.desc())
        .limit(1)
    )
    last_at = res2.scalar_one_or_none()
    if last_at is not None:
        delta = (now - last_at).total_seconds()
        if delta < _MIN_SECONDS_BETWEEN_SENDS:
            raise ValueError("rate_limited_cooldown")

    await session.execute(
        update(EmailLoginChallenge)
        .where(
            EmailLoginChallenge.email == email,
            EmailLoginChallenge.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )

    code = _generate_six_digit_code()
    ttl = max(60, int(settings.email_login_code_ttl_seconds))
    expires = now + timedelta(seconds=ttl)
    ch = EmailLoginChallenge(
        email=email,
        code_hash=_code_hash(settings, email, code),
        expires_at=expires,
        consumed_at=None,
    )
    session.add(ch)
    await session.flush()
    return ch, code


async def verify_email_challenge(
    session: AsyncSession,
    settings: Settings,
    *,
    email: str,
    code_raw: str,
) -> uuid.UUID | None:
    """Return user id on success, or None if code invalid/expired."""
    code = _parse_code(code_raw)
    if not code:
        return None
    now = datetime.now(tz=UTC)
    stmt = (
        select(EmailLoginChallenge)
        .where(
            EmailLoginChallenge.email == email,
            EmailLoginChallenge.consumed_at.is_(None),
            EmailLoginChallenge.expires_at > now,
        )
        .order_by(EmailLoginChallenge.created_at.desc())
        .limit(1)
        .with_for_update()
    )
    res = await session.execute(stmt)
    ch = res.scalar_one_or_none()
    if ch is None:
        return None
    expected = _code_hash(settings, email, code)
    if not hmac.compare_digest(ch.code_hash, expected):
        return None
    ch.consumed_at = now
    uid = await ensure_user_for_email(session, email)
    return uid
