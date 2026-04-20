"""initial schema

Revision ID: 001_initial
Revises:
Create Date: 2026-04-10

"""

from typing import Sequence, Union

from alembic import op

from colcoor_backend.db.base import Base
from colcoor_backend.db import models as _models  # noqa: F401

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    # Creates the full schema from current ORM models. Later revisions (005+) use IF NOT EXISTS /
    # guards so `alembic upgrade head` stays safe when tables already exist here.
    Base.metadata.create_all(bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind)
