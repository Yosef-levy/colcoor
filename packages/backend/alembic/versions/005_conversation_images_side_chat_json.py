"""Conversation image metadata (GCS object_key) + optional side_chat_messages.content_json.

Revision ID: 005_conversation_images
Revises: 004_checkpoint_label
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005_conversation_images"
down_revision: Union[str, None] = "004_checkpoint_label"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("conversation_images"):
        op.create_table(
            "conversation_images",
            sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column(
                "conversation_id",
                sa.Uuid(),
                sa.ForeignKey("conversations.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "uploaded_by_user_id",
                sa.Uuid(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("mime_type", sa.Text(), nullable=False),
            sa.Column("byte_size", sa.Integer(), nullable=False),
            sa.Column("object_key", sa.Text(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
        )
        op.create_index(
            "idx_conversation_images_conversation_id",
            "conversation_images",
            ["conversation_id"],
        )
    else:
        op.execute(
            "CREATE INDEX IF NOT EXISTS idx_conversation_images_conversation_id "
            "ON conversation_images (conversation_id);"
        )
    op.execute("ALTER TABLE side_chat_messages ADD COLUMN IF NOT EXISTS content_json jsonb NULL;")


def downgrade() -> None:
    op.execute("ALTER TABLE side_chat_messages DROP COLUMN IF EXISTS content_json;")
    op.execute("DROP INDEX IF EXISTS idx_conversation_images_conversation_id;")
    op.execute("DROP TABLE IF EXISTS conversation_images;")
