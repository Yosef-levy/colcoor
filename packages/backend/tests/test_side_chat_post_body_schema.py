"""SideChatPostBody validation (api-contracts §10.2) without database."""

import pytest
from pydantic import ValidationError

from colcoor_backend.api.schemas import SideChatPostBody


def test_side_chat_post_rejects_whitespace_only_body() -> None:
    with pytest.raises(ValidationError):
        SideChatPostBody(body="   \n")


def test_side_chat_post_strips_and_keeps_body() -> None:
    b = SideChatPostBody(body="  hi  ")
    assert b.body == "hi"
