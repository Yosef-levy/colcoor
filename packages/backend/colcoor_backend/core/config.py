from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Load from environment / optional `.env` in cwd (see repo root `.env.example` for Docker)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = Field(
        default="development",
        validation_alias=AliasChoices("COLCOOR_ENV", "ENV"),
        description="development | staging | production",
    )
    port: int = Field(
        default=8000,
        validation_alias=AliasChoices("PORT", "COLCOOR_PORT"),
        ge=1,
        le=65535,
    )
    cors_origins: str = Field(
        default="",
        validation_alias=AliasChoices("CORS_ORIGINS", "COLCOOR_CORS_ORIGINS"),
    )
    database_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_URL", "COLCOOR_DATABASE_URL"),
    )
    jwt_secret: str | None = Field(
        default=None,
        validation_alias=AliasChoices("JWT_SECRET", "COLCOOR_JWT_SECRET"),
    )
    domain: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DOMAIN", "COLCOOR_DOMAIN"),
    )
    cursor_auth_provider_order: str = Field(
        default="github,microsoft,google",
        validation_alias=AliasChoices(
            "CURSOR_AUTH_PROVIDER_ORDER",
            "COLCOOR_CURSOR_AUTH_PROVIDER_ORDER",
        ),
        description="Comma-separated IdP probe order for POST /auth/cursor when provider_hint=auto",
    )
    cursor_auth_http_timeout_seconds: float = Field(
        default=12.0,
        ge=2.0,
        le=60.0,
        validation_alias=AliasChoices(
            "CURSOR_AUTH_HTTP_TIMEOUT_SECONDS",
            "COLCOOR_CURSOR_AUTH_HTTP_TIMEOUT_SECONDS",
        ),
    )

    #: When true, the API process runs a daily loop that **hard-deletes** events whose
    #: ``deleted_at`` is older than ``event_soft_delete_retention_hours`` (Postgres advisory lock).
    event_purge_scheduler_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices(
            "COLCOOR_EVENT_PURGE_SCHEDULER_ENABLED",
        ),
    )
    event_purge_interval_seconds: int = Field(
        default=86_400,
        ge=3_600,
        le=604_800,
        validation_alias=AliasChoices(
            "COLCOOR_EVENT_PURGE_INTERVAL_SECONDS",
        ),
        description="Sleep between purge runs when the scheduler is enabled (default 24h).",
    )
    event_purge_initial_delay_seconds: int = Field(
        default=300,
        ge=0,
        le=86_400,
        validation_alias=AliasChoices(
            "COLCOOR_EVENT_PURGE_INITIAL_DELAY_SECONDS",
        ),
        description="Delay before the first purge after process start (stagger multi-worker / tests).",
    )
    event_soft_delete_retention_hours: int = Field(
        default=336,
        ge=1,
        le=8760,
        validation_alias=AliasChoices(
            "COLCOOR_EVENT_SOFT_DELETE_RETENTION_HOURS",
        ),
        description="Events with non-null ``deleted_at`` older than this window are eligible for hard delete (default 336h = 14 days).",
    )
    event_delete_undo_window_minutes: int = Field(
        default=5,
        ge=1,
        le=1440,
        validation_alias=AliasChoices(
            "COLCOOR_EVENT_DELETE_UNDO_WINDOW_MINUTES",
        ),
        description="Only the user who soft-deleted may undo within this window (same ``deletion_group_id``).",
    )

    # ----- Email OTP login (POST /auth/email/*) -----
    smtp_host: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SMTP_HOST", "COLCOOR_SMTP_HOST"),
    )
    smtp_port: int = Field(
        default=587,
        ge=1,
        le=65535,
        validation_alias=AliasChoices("SMTP_PORT", "COLCOOR_SMTP_PORT"),
    )
    smtp_user: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SMTP_USER", "COLCOOR_SMTP_USER"),
    )
    smtp_password: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SMTP_PASSWORD", "COLCOOR_SMTP_PASSWORD"),
    )
    smtp_from: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SMTP_FROM", "COLCOOR_SMTP_FROM"),
        description="RFC5322 From address when sending OTP mail (defaults to smtp_user if empty).",
    )
    email_login_code_ttl_seconds: int = Field(
        default=600,
        ge=60,
        le=3600,
        validation_alias=AliasChoices(
            "COLCOOR_EMAIL_LOGIN_CODE_TTL_SECONDS",
        ),
        description="Lifetime of each email OTP challenge (seconds).",
    )
    email_login_log_codes: bool = Field(
        default=False,
        validation_alias=AliasChoices("COLCOOR_EMAIL_LOGIN_LOG_CODES"),
        description="Development only: log OTP to server logs instead of SMTP (never enable in production).",
    )

    def is_production(self) -> bool:
        return self.env.strip().lower() == "production"

    def cors_origin_list(self) -> list[str]:
        """Explicit origins only. Empty => do not install CORS middleware (no allow-all)."""
        if not self.cors_origins.strip():
            return []
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
