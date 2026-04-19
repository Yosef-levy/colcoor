"""Main-thread events: deletion batch id and deleter for undo / restore.

Revision ID: 008_events_deletion_group
Revises: 007_side_chat_deleted_by
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008_events_deletion_group"
down_revision: Union[str, None] = "007_side_chat_deleted_by"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("events", sa.Column("deletion_group_id", sa.Uuid(), nullable=True))
    op.add_column("events", sa.Column("deleted_by_user_id", sa.Uuid(), nullable=True))
    op.create_index("idx_events_deletion_group_id", "events", ["deletion_group_id"])
    op.create_foreign_key(
        "fk_events_deleted_by_user_id_users",
        "events",
        "users",
        ["deleted_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_events_deleted_by_user_id_users", "events", type_="foreignkey")
    op.drop_index("idx_events_deletion_group_id", table_name="events")
    op.drop_column("events", "deleted_by_user_id")
    op.drop_column("events", "deletion_group_id")
