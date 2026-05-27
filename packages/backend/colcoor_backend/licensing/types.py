"""Deployment profiles and license tiers (env-driven; one backend codebase)."""

from __future__ import annotations

from typing import Final

# Deployment topology — not separate backends or images.
DEPLOYMENT_PROFILES: Final[frozenset[str]] = frozenset(
    {"free", "team", "business", "hosted", "enterprise", "gcp-production"}
)

# Commercial / entitlement tier (maps to Lemon Squeezy products later).
LICENSE_TYPES: Final[frozenset[str]] = frozenset({"free", "team", "business", "enterprise"})

# Default seat caps when COLCOOR_LICENSE_MAX_USERS is unset (0 = unlimited).
DEFAULT_MAX_USERS_BY_LICENSE_TYPE: Final[dict[str, int]] = {
    "free": 3,
    "team": 50,
    "business": 500,
    "enterprise": 0,
}

# Self-host profiles may use local disk for images in production (no GCS required).
SELF_HOST_DEPLOYMENT_PROFILES: Final[frozenset[str]] = frozenset({"free", "team", "business"})
