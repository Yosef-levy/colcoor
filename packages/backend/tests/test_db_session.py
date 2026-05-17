"""SQLAlchemy engine settings for PgBouncer compatibility."""

from __future__ import annotations

from unittest.mock import patch

from colcoor_backend.db.session import create_engine


def test_asyncpg_passes_disabled_statement_cache_to_create_async_engine() -> None:
    with patch("colcoor_backend.db.session.create_async_engine") as mock_create:
        create_engine("postgresql+asyncpg://u:p@pgbouncer:6432/db")
        kwargs = mock_create.call_args.kwargs
        assert kwargs["connect_args"] == {
            "prepared_statement_cache_size": 0,
            "statement_cache_size": 0,
        }


def test_psycopg_url_omits_asyncpg_statement_cache_connect_args() -> None:
    with patch("colcoor_backend.db.session.create_async_engine") as mock_create:
        create_engine("postgresql+psycopg://u:p@postgres:5432/db")
        kwargs = mock_create.call_args.kwargs
        assert kwargs.get("connect_args") == {}
