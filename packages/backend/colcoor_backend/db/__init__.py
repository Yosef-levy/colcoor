"""PostgreSQL persistence (SQLAlchemy 2 async)."""

from colcoor_backend.db import models as _models  # noqa: F401 — register mappers
from colcoor_backend.db.base import Base

__all__ = ["Base"]
