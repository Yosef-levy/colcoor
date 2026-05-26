"""Logging configuration: Settings.log_format and configure_logging()."""

from __future__ import annotations

import logging

import pytest

from colcoor_backend.core.config import get_settings
from colcoor_backend.logging_config import JsonLogFormatter, configure_logging


def test_resolved_log_format_default_production_json(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COLCOOR_ENV", "production")
    monkeypatch.delenv("COLCOOR_LOG_FORMAT", raising=False)
    get_settings.cache_clear()
    assert get_settings().resolved_log_format() == "json"


def test_resolved_log_format_default_development_text(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COLCOOR_ENV", "development")
    monkeypatch.delenv("COLCOOR_LOG_FORMAT", raising=False)
    get_settings.cache_clear()
    assert get_settings().resolved_log_format() == "text"


def test_resolved_log_format_explicit_text_overrides_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COLCOOR_ENV", "production")
    monkeypatch.setenv("COLCOOR_LOG_FORMAT", "text")
    get_settings.cache_clear()
    assert get_settings().resolved_log_format() == "text"


def test_resolved_log_format_explicit_json_in_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COLCOOR_ENV", "development")
    monkeypatch.setenv("COLCOOR_LOG_FORMAT", "json")
    get_settings.cache_clear()
    assert get_settings().resolved_log_format() == "json"


def test_resolved_log_format_invalid_falls_back_to_production_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COLCOOR_ENV", "production")
    monkeypatch.setenv("COLCOOR_LOG_FORMAT", "invalid")
    get_settings.cache_clear()
    assert get_settings().resolved_log_format() == "json"


def _root_formatter() -> logging.Formatter | None:
    handlers = logging.getLogger().handlers
    return handlers[0].formatter if handlers else None


def test_configure_logging_uses_json_formatter_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COLCOOR_ENV", "production")
    monkeypatch.delenv("COLCOOR_LOG_FORMAT", raising=False)
    get_settings.cache_clear()
    configure_logging(get_settings())
    assert isinstance(_root_formatter(), JsonLogFormatter)
    assert logging.getLogger("uvicorn.access").disabled is True


def test_configure_logging_uses_text_formatter_in_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COLCOOR_ENV", "development")
    monkeypatch.delenv("COLCOOR_LOG_FORMAT", raising=False)
    get_settings.cache_clear()
    configure_logging(get_settings())
    formatter = _root_formatter()
    assert formatter is not None
    assert not isinstance(formatter, JsonLogFormatter)
    assert logging.getLogger("uvicorn.access").disabled is True


def test_configure_logging_warns_on_invalid_format(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("COLCOOR_ENV", "production")
    monkeypatch.setenv("COLCOOR_LOG_FORMAT", "yaml")
    get_settings.cache_clear()
    configure_logging(get_settings())
    out = capsys.readouterr().out
    assert "Invalid COLCOOR_LOG_FORMAT" in out
    assert get_settings().resolved_log_format() == "json"
