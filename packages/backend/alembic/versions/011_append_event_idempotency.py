"""Append-event idempotency keys (dedupe client retries).

Revision ID: 011_append_event_idempotency
Revises: 010_drop_side_chat_pg_notify
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011_append_event_idempotency"
down_revision: Union[str, None] = "010_drop_side_chat_pg_notify"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table("append_event_idempotency"):
        op.create_table(
            "append_event_idempotency",
            sa.Column("conversation_id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("idempotency_key", sa.Text(), nullable=False),
            sa.Column("event_id", sa.Uuid(), nullable=True),
            sa.Column(
                "created_at",
                sa.TIMESTAMP(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint(
                "conversation_id",
                "user_id",
                "idempotency_key",
                name="pk_append_event_idempotency",
            ),
        )
    existing_indexes = {idx["name"] for idx in insp.get_indexes("append_event_idempotency")}
    if "idx_append_event_idempotency_event_id" not in existing_indexes:
        op.create_index(
            "idx_append_event_idempotency_event_id",
            "append_event_idempotency",
            ["event_id"],
            unique=False,
        )
    if "idx_append_event_idempotency_created_at" not in existing_indexes:
        op.create_index(
            "idx_append_event_idempotency_created_at",
            "append_event_idempotency",
            ["created_at"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if insp.has_table("append_event_idempotency"):
        existing_indexes = {idx["name"] for idx in insp.get_indexes("append_event_idempotency")}
        if "idx_append_event_idempotency_created_at" in existing_indexes:
            op.drop_index("idx_append_event_idempotency_created_at", table_name="append_event_idempotency")
        if "idx_append_event_idempotency_event_id" in existing_indexes:
            op.drop_index("idx_append_event_idempotency_event_id", table_name="append_event_idempotency")
        op.drop_table("append_event_idempotency")
