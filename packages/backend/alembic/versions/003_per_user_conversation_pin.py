"""per-user pinned on conversation_members; drop conversations.pinned

Revision ID: 003_per_user_pin
Revises: 002_owner_idx
"""

from typing import Sequence, Union

from alembic import op

revision: str = "003_per_user_pin"
down_revision: Union[str, None] = "002_owner_idx"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;")
    op.execute("DROP INDEX IF EXISTS idx_conversations_pinned;")
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS pinned;")


def downgrade() -> None:
    op.execute("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;")
    op.execute("CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON conversations (pinned);")
    op.execute("ALTER TABLE conversation_members DROP COLUMN IF EXISTS pinned;")
