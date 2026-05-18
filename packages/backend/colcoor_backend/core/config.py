from functools import lru_cache

from pydantic import AliasChoices, Field, field_validator
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
    database_migration_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "DATABASE_MIGRATION_URL",
            "COLCOOR_DATABASE_MIGRATION_URL",
        ),
        description="Direct Postgres URL for Alembic (bypass PgBouncer). Optional in dev.",
    )
    db_pool_size: int = Field(
        default=5,
        ge=1,
        le=100,
        validation_alias=AliasChoices("DB_POOL_SIZE", "COLCOOR_DB_POOL_SIZE"),
    )
    db_max_overflow: int = Field(
        default=5,
        ge=0,
        le=100,
        validation_alias=AliasChoices("DB_MAX_OVERFLOW", "COLCOOR_DB_MAX_OVERFLOW"),
    )
    db_pool_timeout: int = Field(
        default=30,
        ge=1,
        le=300,
        validation_alias=AliasChoices("DB_POOL_TIMEOUT", "COLCOOR_DB_POOL_TIMEOUT"),
    )
    db_pool_recycle: int = Field(
        default=1800,
        ge=60,
        le=86_400,
        validation_alias=AliasChoices("DB_POOL_RECYCLE", "COLCOOR_DB_POOL_RECYCLE"),
    )
    redis_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("REDIS_URL", "COLCOOR_REDIS_URL"),
        description="Redis for side-chat SSE wakeups (pub/sub). Required in production.",
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

    image_storage_backend: str = Field(
        default="",
        validation_alias=AliasChoices(
            "COLCOOR_IMAGE_STORAGE",
            "IMAGE_STORAGE",
        ),
        description="gcs | local. Empty: gcs when GCS_BUCKET set, else local.",
    )
    gcs_bucket: str | None = Field(
        default=None,
        validation_alias=AliasChoices("GCS_BUCKET", "COLCOOR_GCS_BUCKET"),
        description="GCS bucket for conversation images (required in production).",
    )
    gcs_signed_url_ttl_seconds: int = Field(
        default=300,
        ge=60,
        le=3600,
        validation_alias=AliasChoices(
            "GCS_SIGNED_URL_TTL_SECONDS",
            "COLCOOR_GCS_SIGNED_URL_TTL_SECONDS",
        ),
        description="TTL for GET image signed URLs (default 5 minutes; max 1 hour).",
    )
    max_image_bytes: int = Field(
        default=8 * 1024 * 1024,
        ge=1024,
        le=32 * 1024 * 1024,
        validation_alias=AliasChoices(
            "COLCOOR_MAX_IMAGE_BYTES",
            "MAX_IMAGE_BYTES",
        ),
        description="Max upload size per conversation image (default 8 MiB).",
    )
    local_image_storage_path: str = Field(
        default="/tmp/colcoor-images",
        validation_alias=AliasChoices(
            "COLCOOR_LOCAL_IMAGE_STORAGE_PATH",
            "LOCAL_IMAGE_STORAGE_PATH",
        ),
        description="Root directory when image storage backend is local.",
    )
    metrics_enabled: bool = Field(
        default=True,
        validation_alias=AliasChoices(
            "COLCOOR_METRICS_ENABLED",
            "METRICS_ENABLED",
        ),
        description="Expose Prometheus /metrics endpoint.",
    )
    log_format: str = Field(
        default="",
        validation_alias=AliasChoices("COLCOOR_LOG_FORMAT", "LOG_FORMAT"),
        description="json | text. Empty: json in production, text otherwise.",
    )
    rate_limit_enabled: bool = Field(
        default=True,
        validation_alias=AliasChoices(
            "RATE_LIMIT_ENABLED",
            "COLCOOR_RATE_LIMIT_ENABLED",
        ),
    )
    rate_limit_rps_per_user: float = Field(
        default=10.0,
        ge=0.0,
        validation_alias=AliasChoices(
            "RATE_LIMIT_RPS_PER_USER",
            "COLCOOR_RATE_LIMIT_RPS_PER_USER",
        ),
    )
    rate_limit_burst_per_user: float = Field(
        default=20.0,
        ge=1.0,
        validation_alias=AliasChoices(
            "RATE_LIMIT_BURST_PER_USER",
            "COLCOOR_RATE_LIMIT_BURST_PER_USER",
        ),
    )
    rate_limit_rps_anon: float = Field(
        default=5.0,
        ge=0.0,
        validation_alias=AliasChoices(
            "RATE_LIMIT_RPS_ANON",
            "COLCOOR_RATE_LIMIT_RPS_ANON",
        ),
    )
    rate_limit_burst_anon: float = Field(
        default=10.0,
        ge=1.0,
        validation_alias=AliasChoices(
            "RATE_LIMIT_BURST_ANON",
            "COLCOOR_RATE_LIMIT_BURST_ANON",
        ),
    )
    rate_limit_trust_proxy: bool = Field(
        default=False,
        validation_alias=AliasChoices(
            "RATE_LIMIT_TRUST_PROXY",
            "COLCOOR_RATE_LIMIT_TRUST_PROXY",
        ),
        description="Honor X-Forwarded-For for anonymous IP buckets (true behind nginx).",
    )

    deployment_profile: str = Field(
        default="free",
        validation_alias=AliasChoices(
            "COLCOOR_DEPLOYMENT_PROFILE",
            "DEPLOYMENT_PROFILE",
        ),
        description="free | team | business | hosted | enterprise — deployment topology, not a separate backend.",
    )
    license_type: str = Field(
        default="free",
        validation_alias=AliasChoices(
            "COLCOOR_LICENSE_TYPE",
            "LICENSE_TYPE",
        ),
        description="free | team | business | enterprise — entitlement tier (Lemon Squeezy later).",
    )
    license_max_users: int | None = Field(
        default=None,
        ge=0,
        le=1_000_000,
        validation_alias=AliasChoices(
            "COLCOOR_LICENSE_MAX_USERS",
            "LICENSE_MAX_USERS",
        ),
        description="Seat cap override. Unset uses defaults by license_type (0 = unlimited).",
    )
    license_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "COLCOOR_LICENSE_KEY",
            "LICENSE_KEY",
        ),
        description="Optional license key (Lemon Squeezy). Never log the raw value.",
    )

    @field_validator("license_max_users", mode="before")
    @classmethod
    def _empty_license_max_users_is_none(cls, value: object) -> object:
        if value == "" or value is None:
            return None
        return value

    @field_validator("license_key", mode="before")
    @classmethod
    def _empty_license_key_is_none(cls, value: object) -> object:
        if value == "" or value is None:
            return None
        return value

    def is_production(self) -> bool:
        return self.env.strip().lower() == "production"

    def redis_url_normalized(self) -> str | None:
        if not self.redis_url or not self.redis_url.strip():
            return None
        return self.redis_url.strip()

    def gcs_bucket_normalized(self) -> str | None:
        if not self.gcs_bucket or not self.gcs_bucket.strip():
            return None
        return self.gcs_bucket.strip()

    def local_image_storage_path_normalized(self) -> str:
        return self.local_image_storage_path.strip() or "/tmp/colcoor-images"

    def resolved_image_storage_backend(self) -> str:
        explicit = self.image_storage_backend.strip().lower()
        if explicit in ("gcs", "local"):
            return explicit
        if self.gcs_bucket_normalized():
            return "gcs"
        return "local"

    def cors_origin_list(self) -> list[str]:
        """Explicit origins only. Empty => do not install CORS middleware (no allow-all)."""
        if not self.cors_origins.strip():
            return []
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def deployment_profile_normalized(self) -> str:
        return self.deployment_profile.strip().lower()

    def license_type_normalized(self) -> str:
        return self.license_type.strip().lower()

    def license_key_present(self) -> bool:
        return bool(self.license_key and self.license_key.strip())

    def resolved_license_max_users(self) -> int:
        from colcoor_backend.licensing.types import DEFAULT_MAX_USERS_BY_LICENSE_TYPE

        if self.license_max_users is not None:
            return self.license_max_users
        return DEFAULT_MAX_USERS_BY_LICENSE_TYPE.get(
            self.license_type_normalized(),
            DEFAULT_MAX_USERS_BY_LICENSE_TYPE["free"],
        )

    def is_self_host_deployment_profile(self) -> bool:
        from colcoor_backend.licensing.types import SELF_HOST_DEPLOYMENT_PROFILES

        return self.deployment_profile_normalized() in SELF_HOST_DEPLOYMENT_PROFILES


@lru_cache
def get_settings() -> Settings:
    return Settings()
