import uuid

import pytest

from colcoor_backend.services.graph import instantiate_template_note_contents


def test_instantiates_conversation_id_and_canonicalizes_exact_duplicates() -> None:
    conversation_id = uuid.uuid4()
    assert instantiate_template_note_contents(
        [
            "Conversation <conversation_id>",
            "  Same\r\ncontent  ",
            "Same\ncontent",
        ],
        conversation_id,
    ) == [f"Conversation {conversation_id}", "Same\ncontent"]


def test_rejects_empty_and_oversized_root_notes() -> None:
    conversation_id = uuid.uuid4()
    with pytest.raises(ValueError, match="empty"):
        instantiate_template_note_contents(["  "], conversation_id)
    with pytest.raises(ValueError, match="12000"):
        instantiate_template_note_contents(["x" * 12_001], conversation_id)
