"""Centralized licensing (env/offline today; Lemon Squeezy later)."""

from colcoor_backend.licensing.exceptions import LicenseUserLimitReached
from colcoor_backend.licensing.service import (
    LicenseStatus,
    assert_can_register_new_user,
    get_license_status,
)

__all__ = [
    "LicenseStatus",
    "LicenseUserLimitReached",
    "assert_can_register_new_user",
    "get_license_status",
]
