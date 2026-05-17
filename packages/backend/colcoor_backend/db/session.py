"""Async engine and session factory (wired in FastAPI lifespan)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from colcoor_backend.core.config import Settings, get_settings


def create_engine(url: str, *, settings: Settings | None = None) -> AsyncEngine:
    """
    Create the application async engine.

    When ``DATABASE_URL`` points at PgBouncer in **transaction** pooling mode, asyncpg must
    not cache prepared statements: the server backend may change between transactions, so
    named prepared statements from a prior transaction are invalid (``DuplicatePreparedStatement``,
    silent wrong results). Set ``prepared_statement_cache_size=0`` and ``statement_cache_size=0``.
    """
    cfg = settings or get_settings()
    connect_args: dict[str, int] = {}
    if "+asyncpg" in url:
        connect_args["prepared_statement_cache_size"] = 0
        connect_args["statement_cache_size"] = 0
    return create_async_engine(
        url,
        pool_pre_ping=True,
        pool_size=cfg.db_pool_size,
        max_overflow=cfg.db_max_overflow,
        pool_timeout=cfg.db_pool_timeout,
        pool_recycle=cfg.db_pool_recycle,
        connect_args=connect_args,
    )


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
