import pytest

from colcoor_backend.app import create_app
from colcoor_backend.core.config import get_settings
from colcoor_backend.core.validation import validate_cors_origins_non_wildcard, validate_production_settings


def test_create_app_rejects_cors_wildcard(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "*")
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        create_app()


def test_validate_cors_rejects_star_in_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "https://ok.example, *")
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        validate_cors_origins_non_wildcard(get_settings())


def test_production_rejects_short_jwt_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COLCOOR_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "short")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://u:VeryLongRandomPassw0rdxxxxxxxxxxxx@postgres:5432/db",
    )
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        validate_production_settings(get_settings())


def test_production_rejects_placeholder_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COLCOOR_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "a" * 40)
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://u:change-me-weak@postgres:5432/db",
    )
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        validate_production_settings(get_settings())
