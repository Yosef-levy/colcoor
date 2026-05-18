"""Licensing errors surfaced to API clients."""

from __future__ import annotations


class LicenseUserLimitReached(Exception):
    """Raised when registering a new user would exceed the licensed seat count."""

    def __init__(
        self,
        message: str = (
            "This Colcoor instance has reached its licensed user limit. "
            "Ask your administrator to upgrade the license or remove inactive users."
        ),
    ) -> None:
        super().__init__(message)
