"""partial unique index: one owner per conversation

Revision ID: 002_owner_idx
Revises: 001_initial
"""

from typing import Sequence, Union

from alembic import op

revision: str = "002_owner_idx"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_single_owner
        ON conversation_members (conversation_id)
        WHERE (role = 'owner');
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_conversation_single_owner;")
