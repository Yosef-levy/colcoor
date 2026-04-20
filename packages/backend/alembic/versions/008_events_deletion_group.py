"""Main-thread events: deletion batch id and deleter for undo / restore.

Revision ID: 008_events_deletion_group
Revises: 007_side_chat_deleted_by
"""

from typing import Sequence, Union

from alembic import op

revision: str = "008_events_deletion_group"
down_revision: Union[str, None] = "007_side_chat_deleted_by"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS deletion_group_id UUID NULL;")
    op.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID NULL;")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_events_deletion_group_id ON events (deletion_group_id);"
    )
    op.execute("""
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_events_deleted_by_user_id_users'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT fk_events_deleted_by_user_id_users
      FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
""")


def downgrade() -> None:
    op.execute("ALTER TABLE events DROP CONSTRAINT IF EXISTS fk_events_deleted_by_user_id_users;")
    op.execute("DROP INDEX IF EXISTS idx_events_deletion_group_id;")
    op.execute("ALTER TABLE events DROP COLUMN IF EXISTS deleted_by_user_id;")
    op.execute("ALTER TABLE events DROP COLUMN IF EXISTS deletion_group_id;")
