"""Fail-fast checks for production configuration."""

from __future__ import annotations

import re

from colcoor_backend.core.config import Settings

# Substrings that strongly suggest copy-paste placeholders (not exhaustive).
_PLACEHOLDER_MARKERS: tuple[str, ...] = (
    "change-me",
    "changeme",
    "replace_me",
    "replace-me",
    "your-secret",
    "example.com",
    "password",
    "postgres:postgres",
    ":postgres@",
)

_MIN_JWT_SECRET_LEN = 32


def _contains_placeholder(value: str) -> bool:
    lower = value.lower()
    return any(marker in lower for marker in _PLACEHOLDER_MARKERS)


def _jwt_secret_invalid(secret: str | None) -> str | None:
    if not secret or not secret.strip():
        return "JWT_SECRET is missing or empty"
    if len(secret) < _MIN_JWT_SECRET_LEN:
        return f"JWT_SECRET must be at least {_MIN_JWT_SECRET_LEN} characters in production"
    if _contains_placeholder(secret):
        return "JWT_SECRET looks like a placeholder or default; set a strong random secret"
    return None


def _database_url_invalid(url: str | None) -> str | None:
    if not url or not url.strip():
        return "DATABASE_URL is missing or empty in production"
    if _contains_placeholder(url):
        return "DATABASE_URL appears to contain placeholder or weak credentials"
    if not re.match(r"^postgresql(\+asyncpg)?://", url.strip()):
        return "DATABASE_URL must start with postgresql:// or postgresql+asyncpg://"
    return None


def validate_production_settings(settings: Settings) -> None:
    """Raise RuntimeError if production configuration is unsafe."""
    if not settings.is_production():
        return

    if msg := _jwt_secret_invalid(settings.jwt_secret):
        raise RuntimeError(f"Production misconfiguration: {msg}")

    if msg := _database_url_invalid(settings.database_url):
        raise RuntimeError(f"Production misconfiguration: {msg}")

    for origin in settings.cors_origin_list():
        if origin.strip() == "*":
            raise RuntimeError(
                "Production misconfiguration: CORS_ORIGINS must not contain '*' "
                "(that would be allow-all). List explicit HTTPS origins instead."
            )


def validate_cors_origins_non_wildcard(settings: Settings) -> None:
    """Reject wildcard CORS in all environments (never allow-all)."""
    for origin in settings.cors_origin_list():
        if origin.strip() == "*":
            raise RuntimeError(
                "CORS_ORIGINS must not contain '*'. Leave CORS_ORIGINS empty to disable browser CORS, "
                "or list explicit origins."
            )
