"""SQLAlchemy engine settings for PgBouncer compatibility."""

from __future__ import annotations

from colcoor_backend.core.config import Settings
from colcoor_backend.db.session import create_engine


def test_asyncpg_disables_prepared_statement_cache() -> None:
    engine = create_engine(
        "postgresql+asyncpg://u:p@pgbouncer:6432/db",
        settings=Settings(
            db_pool_size=3,
            db_max_overflow=2,
            db_pool_timeout=10,
            db_pool_recycle=600,
        ),
    )
    assert engine.pool.size() == 3
    assert engine.pool._max_overflow == 2  # noqa: SLF001
    assert engine.pool._timeout == 10  # noqa: SLF001
    assert engine.pool._recycle == 600  # noqa: SLF001
    assert engine.dialect.connect_args == {
        "prepared_statement_cache_size": 0,
        "statement_cache_size": 0,
    }


def test_non_asyncpg_url_has_no_connect_args() -> None:
    engine = create_engine("postgresql+psycopg://u:p@postgres:5432/db")
    assert engine.dialect.connect_args == {}
