"""Conversations: soft delete batch columns (undo / restore with graph).

Revision ID: 009_conversations_soft_delete
Revises: 008_events_deletion_group
"""

from typing import Sequence, Union

from alembic import op

revision: str = "009_conversations_soft_delete"
down_revision: Union[str, None] = "008_events_deletion_group"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;"
    )
    op.execute(
        "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deletion_group_id UUID NULL;"
    )
    op.execute(
        "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversations_deleted_at ON conversations (deleted_at);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversations_deletion_group_id "
        "ON conversations (deletion_group_id);"
    )
    op.execute("""
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_conversations_deleted_by_user_id_users'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT fk_conversations_deleted_by_user_id_users
      FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
""")


def downgrade() -> None:
    op.execute(
        "ALTER TABLE conversations DROP CONSTRAINT IF EXISTS fk_conversations_deleted_by_user_id_users;"
    )
    op.execute("DROP INDEX IF EXISTS idx_conversations_deletion_group_id;")
    op.execute("DROP INDEX IF EXISTS idx_conversations_deleted_at;")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS deleted_by_user_id;")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS deletion_group_id;")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS deleted_at;")
