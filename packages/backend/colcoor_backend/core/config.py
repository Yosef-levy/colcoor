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
