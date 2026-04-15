"""pg_notify on side_chat_messages for low-latency SSE wakeups.

Revision ID: 006_side_chat_pg_notify
Revises: 005_conversation_images
"""

from typing import Sequence, Union

from alembic import op

revision: str = "006_side_chat_pg_notify"
down_revision: Union[str, None] = "005_conversation_images"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
CREATE OR REPLACE FUNCTION colcoor_notify_side_chat_message() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'colcoor_side_chat',
    json_build_object('c', NEW.conversation_id::text, 's', NEW.seq)::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""
    )
    op.execute("DROP TRIGGER IF EXISTS side_chat_messages_notify_aiu ON side_chat_messages;")
    op.execute(
        """
CREATE TRIGGER side_chat_messages_notify_aiu
AFTER INSERT OR UPDATE ON side_chat_messages
FOR EACH ROW EXECUTE PROCEDURE colcoor_notify_side_chat_message();
"""
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS side_chat_messages_notify_aiu ON side_chat_messages;")
    op.execute("DROP FUNCTION IF EXISTS colcoor_notify_side_chat_message();")
