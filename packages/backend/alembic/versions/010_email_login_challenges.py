"""Email OTP challenges for passwordless sign-in (Claude Desktop, etc.).

Revision ID: 010_email_login_challenges
Revises: 009_conversations_soft_delete
"""

from typing import Sequence, Union

from alembic import op

revision: str = "010_email_login_challenges"
down_revision: Union[str, None] = "009_conversations_soft_delete"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS email_login_challenges (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email TEXT NOT NULL,
            code_hash TEXT NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            consumed_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_email_login_challenges_email_created "
        "ON email_login_challenges (email, created_at DESC);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_email_login_challenges_expires "
        "ON email_login_challenges (expires_at);"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS email_login_challenges;")
