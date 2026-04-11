"""Readiness checks (database connectivity)."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


async def ping_database(engine: AsyncEngine) -> None:
    """Raise if the database is not reachable (simple SELECT 1)."""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
