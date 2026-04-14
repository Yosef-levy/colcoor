"""events.checkpoint_label for breadcrumb UI (optional display-only).

Revision ID: 004_checkpoint_label
Revises: 003_per_user_pin
"""

from typing import Sequence, Union

from alembic import op

revision: str = "004_checkpoint_label"
down_revision: Union[str, None] = "003_per_user_pin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE events ADD COLUMN IF NOT EXISTS checkpoint_label text NULL;")


def downgrade() -> None:
    op.execute("ALTER TABLE events DROP COLUMN IF EXISTS checkpoint_label;")
