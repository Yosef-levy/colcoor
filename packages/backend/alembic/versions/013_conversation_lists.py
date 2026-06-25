"""Private per-conversation Lists.

Revision ID: 013_conversation_lists
Revises: 012_conversation_metadata_json
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "013_conversation_lists"
down_revision: Union[str, None] = "012_conversation_metadata_json"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("conversation_lists"):
        op.create_table(
            "conversation_lists",
            sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column(
                "conversation_id",
                sa.Uuid(),
                sa.ForeignKey("conversations.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "owner_user_id",
                sa.Uuid(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("color", sa.Text(), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column(
                "metadata_json",
                postgresql.JSONB(),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_lists_owner_name_lower "
        "ON conversation_lists (conversation_id, owner_user_id, lower(name));"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversation_lists_conversation_owner "
        "ON conversation_lists (conversation_id, owner_user_id);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversation_lists_sort_order "
        "ON conversation_lists (conversation_id, owner_user_id, sort_order);"
    )

    if not insp.has_table("conversation_list_items"):
        op.create_table(
            "conversation_list_items",
            sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column(
                "list_id",
                sa.Uuid(),
                sa.ForeignKey("conversation_lists.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "conversation_id",
                sa.Uuid(),
                sa.ForeignKey("conversations.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "owner_user_id",
                sa.Uuid(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "event_id",
                sa.Uuid(),
                sa.ForeignKey("events.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("selected_text", sa.Text(), nullable=False),
            sa.Column("anchor_json", postgresql.JSONB(), nullable=False),
            sa.Column("source_content_hash", sa.Text(), nullable=True),
            sa.Column("sort_order", sa.Integer(), nullable=True),
            sa.Column(
                "metadata_json",
                postgresql.JSONB(),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversation_list_items_conversation_owner "
        "ON conversation_list_items (conversation_id, owner_user_id, created_at);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversation_list_items_list_created "
        "ON conversation_list_items (list_id, created_at);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_conversation_list_items_event_id "
        "ON conversation_list_items (event_id);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_conversation_list_items_event_id;")
    op.execute("DROP INDEX IF EXISTS idx_conversation_list_items_list_created;")
    op.execute("DROP INDEX IF EXISTS idx_conversation_list_items_conversation_owner;")
    op.execute("DROP TABLE IF EXISTS conversation_list_items;")
    op.execute("DROP INDEX IF EXISTS idx_conversation_lists_sort_order;")
    op.execute("DROP INDEX IF EXISTS idx_conversation_lists_conversation_owner;")
    op.execute("DROP INDEX IF EXISTS uq_conversation_lists_owner_name_lower;")
    op.execute("DROP TABLE IF EXISTS conversation_lists;")
