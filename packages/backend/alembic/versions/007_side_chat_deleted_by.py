"""Side-chat soft delete: record which user performed the delete.

Revision ID: 007_side_chat_deleted_by
Revises: 006_side_chat_pg_notify
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_side_chat_deleted_by"
down_revision: Union[str, None] = "006_side_chat_pg_notify"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("side_chat_messages", sa.Column("deleted_by_user_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_side_chat_messages_deleted_by_user_id_users",
        "side_chat_messages",
        "users",
        ["deleted_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_side_chat_messages_deleted_by_user_id_users",
        "side_chat_messages",
        type_="foreignkey",
    )
    op.drop_column("side_chat_messages", "deleted_by_user_id")
