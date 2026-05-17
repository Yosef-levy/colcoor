"""Alembic migration environment (sync engine for DDL; DATABASE_URL with +psycopg for offline/online)."""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from colcoor_backend.db.base import Base
from colcoor_backend.db import models as _models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_sync_database_url() -> str:
    """Prefer direct Postgres for DDL; fall back to DATABASE_URL (e.g. local dev without PgBouncer)."""
    raw = os.environ.get("DATABASE_MIGRATION_URL") or os.environ.get("DATABASE_URL", "")
    if not raw:
        raise RuntimeError("DATABASE_URL or DATABASE_MIGRATION_URL is required for migrations")
    return raw.replace("postgresql+asyncpg://", "postgresql+psycopg://")


def run_migrations_offline() -> None:
    url = get_sync_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_sync_database_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
