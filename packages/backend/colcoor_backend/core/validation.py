"""Fail-fast checks for production configuration."""

from __future__ import annotations

import re

from colcoor_backend.core.config import Settings
from colcoor_backend.licensing.types import DEPLOYMENT_PROFILES, LICENSE_TYPES

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


def _gcs_bucket_invalid(bucket: str | None) -> str | None:
    if not bucket or not bucket.strip():
        return "GCS_BUCKET is missing or empty in production (required for conversation images)"
    if _contains_placeholder(bucket):
        return "GCS_BUCKET appears to be a placeholder"
    return None


def _redis_url_invalid(url: str | None) -> str | None:
    if not url or not url.strip():
        return "REDIS_URL is missing or empty in production (required for side-chat SSE wakeups)"
    if _contains_placeholder(url):
        return "REDIS_URL appears to contain placeholder credentials"
    if not re.match(r"^rediss?://", url.strip()):
        return "REDIS_URL must start with redis:// or rediss://"
    return None


def _database_url_invalid(url: str | None) -> str | None:
    if not url or not url.strip():
        return "DATABASE_URL is missing or empty in production"
    if _contains_placeholder(url):
        return "DATABASE_URL appears to contain placeholder or weak credentials"
    if not re.match(r"^postgresql(\+asyncpg)?://", url.strip()):
        return "DATABASE_URL must start with postgresql:// or postgresql+asyncpg://"
    return None


def _normalize_enum(value: str, env_name: str, allowed: frozenset[str]) -> str:
    normalized = value.strip().lower()
    if normalized not in allowed:
        allowed_list = ", ".join(sorted(allowed))
        raise RuntimeError(
            f"Invalid {env_name}: {value!r}. Must be one of: {allowed_list}"
        )
    return normalized


def validate_license_and_deployment_settings(settings: Settings) -> None:
    """Fail fast on unknown deployment profile or license tier."""
    _normalize_enum(
        settings.deployment_profile,
        "COLCOOR_DEPLOYMENT_PROFILE",
        DEPLOYMENT_PROFILES,
    )
    _normalize_enum(
        settings.license_type,
        "COLCOOR_LICENSE_TYPE",
        LICENSE_TYPES,
    )
    if settings.license_max_users is not None and settings.license_max_users < 0:
        raise RuntimeError(
            "Invalid COLCOOR_LICENSE_MAX_USERS: must be >= 0 (0 means unlimited)"
        )


def validate_production_settings(settings: Settings) -> None:
    """Raise RuntimeError if production configuration is unsafe."""
    validate_license_and_deployment_settings(settings)

    if not settings.is_production():
        return

    if msg := _jwt_secret_invalid(settings.jwt_secret):
        raise RuntimeError(f"Production misconfiguration: {msg}")

    if msg := _database_url_invalid(settings.database_url):
        raise RuntimeError(f"Production misconfiguration: {msg}")

    if msg := _redis_url_invalid(settings.redis_url_normalized()):
        raise RuntimeError(f"Production misconfiguration: {msg}")

    storage_backend = settings.resolved_image_storage_backend()
    if storage_backend == "gcs":
        if msg := _gcs_bucket_invalid(settings.gcs_bucket_normalized()):
            raise RuntimeError(f"Production misconfiguration: {msg}")
    elif storage_backend == "local":
        if not settings.is_self_host_deployment_profile():
            raise RuntimeError(
                "Production misconfiguration: local image storage is only allowed for "
                "self-host deployment profiles (free, team, business). "
                "Use COLCOOR_IMAGE_STORAGE=gcs for hosted/enterprise, or set "
                "COLCOOR_DEPLOYMENT_PROFILE to a self-host value."
            )
    else:
        raise RuntimeError(
            "Production misconfiguration: COLCOOR_IMAGE_STORAGE must be gcs or local"
        )

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
