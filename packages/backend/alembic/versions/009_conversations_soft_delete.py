"""Conversations: soft delete batch columns (undo / restore with graph).

Revision ID: 009_conversations_soft_delete
Revises: 008_events_deletion_group
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009_conversations_soft_delete"
down_revision: Union[str, None] = "008_events_deletion_group"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("conversations", sa.Column("deletion_group_id", sa.Uuid(), nullable=True))
    op.add_column("conversations", sa.Column("deleted_by_user_id", sa.Uuid(), nullable=True))
    op.create_index("idx_conversations_deleted_at", "conversations", ["deleted_at"])
    op.create_index("idx_conversations_deletion_group_id", "conversations", ["deletion_group_id"])
    op.create_foreign_key(
        "fk_conversations_deleted_by_user_id_users",
        "conversations",
        "users",
        ["deleted_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_conversations_deleted_by_user_id_users", "conversations", type_="foreignkey")
    op.drop_index("idx_conversations_deletion_group_id", table_name="conversations")
    op.drop_index("idx_conversations_deleted_at", table_name="conversations")
    op.drop_column("conversations", "deleted_by_user_id")
    op.drop_column("conversations", "deletion_group_id")
    op.drop_column("conversations", "deleted_at")
