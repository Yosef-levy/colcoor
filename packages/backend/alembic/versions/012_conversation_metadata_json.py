"""Conversations: shared metadata JSON.

Revision ID: 012_conversation_metadata_json
Revises: 011_append_event_idempotency
"""

from typing import Sequence, Union

from alembic import op

revision: str = "012_conversation_metadata_json"
down_revision: Union[str, None] = "011_append_event_idempotency"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS metadata_json JSONB NULL;")


def downgrade() -> None:
    op.execute("ALTER TABLE conversations DROP COLUMN IF EXISTS metadata_json;")
