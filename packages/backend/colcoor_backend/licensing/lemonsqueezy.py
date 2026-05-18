"""Lemon Squeezy integration placeholders (offline/env licensing today).

Future wiring (same backend image, no internet required for free self-host):
  1. ``LemonSqueezyLicenseValidator.validate_key`` — POST license key to LS API or verify signed payload.
  2. ``activate`` / ``deactivate`` — instance activation for floating seats (optional).
  3. ``map_product_to_tier`` — variant / product ID → ``license_type`` + ``max_users``.
  4. Webhooks — renewal, revocation, chargeback → update cached entitlement in Redis/DB.

Keep validators behind ``LicenseValidator`` protocol so production can swap offline vs online
without branching business logic in routes or ``graph.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from colcoor_backend.core.config import Settings


@dataclass(frozen=True)
class LicenseValidationResult:
    valid: bool
    license_type: str | None = None
    max_users: int | None = None
    expires_at: datetime | None = None
    message: str | None = None


class LicenseValidator(Protocol):
    async def validate_key(self, license_key: str, settings: Settings) -> LicenseValidationResult:
        """Verify a license key and return entitlement metadata."""

    async def activate(self, license_key: str, instance_id: str) -> LicenseValidationResult:
        """Optional: bind key to this deployment instance."""

    async def deactivate(self, license_key: str, instance_id: str) -> None:
        """Optional: release instance activation."""


class OfflineEnvLicenseValidator:
    """Current MVP: trust ``COLCOOR_LICENSE_*`` env vars; key is optional metadata only."""

    async def validate_key(self, license_key: str, settings: Settings) -> LicenseValidationResult:
        # Lemon Squeezy: replace body with API call or JWT/signature verification.
        _ = license_key
        return LicenseValidationResult(
            valid=True,
            license_type=settings.license_type_normalized(),
            max_users=settings.resolved_license_max_users(),
            message="offline env-based license (no remote verification)",
        )

    async def activate(
        self, license_key: str, instance_id: str, settings: Settings
    ) -> LicenseValidationResult:
        _ = instance_id
        return await self.validate_key(license_key, settings)

    async def deactivate(self, license_key: str, instance_id: str) -> None:
        _ = license_key, instance_id


def get_license_validator(settings: Settings) -> LicenseValidator:
    """Factory for the active validator implementation."""
    _ = settings
    return OfflineEnvLicenseValidator()
