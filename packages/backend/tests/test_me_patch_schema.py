"""MePatchBody validation (api-contracts §9.1) without database."""

import pytest
from pydantic import ValidationError

from colcoor_backend.api.schemas import MePatchBody


def test_me_patch_requires_at_least_one_field() -> None:
    with pytest.raises(ValidationError):
        MePatchBody()


def test_me_patch_display_name_only() -> None:
    b = MePatchBody(display_name="Ada")
    assert b.display_name == "Ada"
    assert b.avatar_url is None


def test_me_patch_avatar_url_null() -> None:
    b = MePatchBody(avatar_url=None)
    assert b.avatar_url is None
