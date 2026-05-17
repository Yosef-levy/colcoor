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


@lru_cache
def get_settings() -> Settings:
    return Settings()
