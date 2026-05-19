"""COLCOOR_RUN_MIGRATIONS settings parsing."""

from __future__ import annotations

import pytest

from colcoor_backend.core.config import Settings, get_settings


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("true", True),
        ("1", True),
        ("false", False),
        ("0", False),
    ],
)
def test_run_migrations_on_startup_env(raw: str, expected: bool) -> None:
    settings = Settings(COLCOOR_RUN_MIGRATIONS=raw)
    assert settings.run_migrations_on_startup is expected


def test_run_migrations_default_true() -> None:
    settings = Settings()
    assert settings.run_migrations_on_startup is True


def test_get_settings_reads_run_migrations(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COLCOOR_RUN_MIGRATIONS", "false")
    get_settings.cache_clear()
    try:
        assert get_settings().run_migrations_on_startup is False
    finally:
        get_settings.cache_clear()
        monkeypatch.delenv("COLCOOR_RUN_MIGRATIONS", raising=False)
