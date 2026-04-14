"""AppendEventBody checkpoint_label (no database)."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from colcoor_backend.api.schemas import AppendEventBody, EventKind


def test_append_event_checkpoint_label_strips_whitespace() -> None:
    b = AppendEventBody(
        kind=EventKind.user_input,
        parent_event_id=uuid4(),
        content="hi",
        author="end_user",
        checkpoint_label="  Branch A  ",
    )
    assert b.checkpoint_label == "Branch A"


def test_append_event_checkpoint_label_blank_becomes_none() -> None:
    b = AppendEventBody(
        kind=EventKind.user_input,
        parent_event_id=uuid4(),
        content="hi",
        author="end_user",
        checkpoint_label="   ",
    )
    assert b.checkpoint_label is None


def test_append_event_checkpoint_label_max_length() -> None:
    with pytest.raises(ValidationError):
        AppendEventBody(
            kind=EventKind.user_input,
            parent_event_id=uuid4(),
            content="hi",
            author="end_user",
            checkpoint_label="x" * 257,
        )
