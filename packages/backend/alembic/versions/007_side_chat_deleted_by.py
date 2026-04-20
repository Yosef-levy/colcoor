"""Side-chat soft delete: record which user performed the delete.

Revision ID: 007_side_chat_deleted_by
Revises: 006_side_chat_pg_notify
"""

from typing import Sequence, Union

from alembic import op

revision: str = "007_side_chat_deleted_by"
down_revision: Union[str, None] = "006_side_chat_pg_notify"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Columns may already exist from 001_initial create_all (current ORM).
    op.execute(
        "ALTER TABLE side_chat_messages ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID NULL;"
    )
    op.execute("""
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_side_chat_messages_deleted_by_user_id_users'
  ) THEN
    ALTER TABLE side_chat_messages
      ADD CONSTRAINT fk_side_chat_messages_deleted_by_user_id_users
      FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
""")


def downgrade() -> None:
    op.execute(
        "ALTER TABLE side_chat_messages DROP CONSTRAINT IF EXISTS fk_side_chat_messages_deleted_by_user_id_users;"
    )
    op.execute("ALTER TABLE side_chat_messages DROP COLUMN IF EXISTS deleted_by_user_id;")
