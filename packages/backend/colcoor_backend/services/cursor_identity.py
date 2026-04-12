"""Verify Cursor / VS Code auth provider access tokens against upstream IdPs.

We never trust opaque strings: each token is validated by calling the provider's
HTTPS user profile API (GitHub, Microsoft Graph, Google userinfo).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum

import httpx

from colcoor_backend.core.config import Settings

logger = logging.getLogger(__name__)

GITHUB_HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


class ProviderHint(str, Enum):
    auto = "auto"
    github = "github"
    microsoft = "microsoft"
    google = "google"


@dataclass(frozen=True, slots=True)
class VerifiedCursorIdentity:
    """Stable external subject + profile fields for users.cursor_sub / row upsert."""

    cursor_sub: str
    email: str
    display_name: str
    avatar_url: str | None


def _synthetic_email(cursor_sub: str) -> str:
    """DB requires non-empty email; use only when IdP returns none."""
    safe = cursor_sub.replace(":", "_").replace("/", "_")[:200]
    return f"{safe}@users.noreply.colcoor"


async def _github_user_emails(client: httpx.AsyncClient, token: str) -> str:
    r = await client.get(
        "https://api.github.com/user/emails",
        headers={"Authorization": f"Bearer {token}", **GITHUB_HEADERS},
    )
    if r.status_code != 200:
        return ""
    rows = r.json()
    if not isinstance(rows, list):
        return ""
    for row in rows:
        if isinstance(row, dict) and row.get("primary") and row.get("verified"):
            return str(row.get("email") or "")
    for row in rows:
        if isinstance(row, dict) and row.get("verified"):
            return str(row.get("email") or "")
    return ""


async def verify_github_token(client: httpx.AsyncClient, token: str) -> VerifiedCursorIdentity | None:
    r = await client.get(
        "https://api.github.com/user",
        headers={"Authorization": f"Bearer {token}", **GITHUB_HEADERS},
    )
    if r.status_code != 200:
        return None
    data = r.json()
    if not isinstance(data, dict):
        return None
    uid = data.get("id")
    if uid is None:
        return None
    login = str(data.get("login") or "").strip()
    email = str(data.get("email") or "").strip()
    if not email:
        email = (await _github_user_emails(client, token)).strip()
    cursor_sub = f"github:{uid}"
    if not email:
        email = f"{login}@users.noreply.github.com" if login else _synthetic_email(cursor_sub)
    display = login or email.split("@", 1)[0]
    avatar = data.get("avatar_url")
    avatar_url = str(avatar).strip() if isinstance(avatar, str) and avatar.strip() else None
    return VerifiedCursorIdentity(
        cursor_sub=cursor_sub,
        email=email,
        display_name=display,
        avatar_url=avatar_url,
    )


async def verify_microsoft_graph_token(client: httpx.AsyncClient, token: str) -> VerifiedCursorIdentity | None:
    r = await client.get(
        "https://graph.microsoft.com/v1.0/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    if r.status_code != 200:
        return None
    data = r.json()
    if not isinstance(data, dict):
        return None
    oid = data.get("id")
    if not oid:
        return None
    cursor_sub = f"microsoft:{oid}"
    email = (
        str(data.get("mail") or "").strip()
        or str(data.get("userPrincipalName") or "").strip()
        or ""
    )
    if not email or "@" not in email:
        email = _synthetic_email(cursor_sub)
    display = str(data.get("displayName") or "").strip() or email.split("@", 1)[0]
    # Graph may expose photo separately; skip extra round-trip for v1.
    return VerifiedCursorIdentity(
        cursor_sub=cursor_sub,
        email=email,
        display_name=display,
        avatar_url=None,
    )


async def verify_google_userinfo_token(client: httpx.AsyncClient, token: str) -> VerifiedCursorIdentity | None:
    r = await client.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {token}"},
    )
    if r.status_code != 200:
        return None
    data = r.json()
    if not isinstance(data, dict):
        return None
    sub = data.get("sub")
    if not sub:
        return None
    cursor_sub = f"google:{sub}"
    email = str(data.get("email") or "").strip()
    if not email:
        email = _synthetic_email(cursor_sub)
    display = str(data.get("name") or data.get("given_name") or "").strip() or email.split("@", 1)[0]
    picture = data.get("picture")
    avatar_url = str(picture).strip() if isinstance(picture, str) and picture.strip() else None
    return VerifiedCursorIdentity(
        cursor_sub=cursor_sub,
        email=email,
        display_name=display,
        avatar_url=avatar_url,
    )


_KNOWN_PROVIDERS = frozenset({"github", "microsoft", "google"})


def _provider_order(settings: Settings) -> list[str]:
    parsed = [
        p.strip().lower()
        for p in settings.cursor_auth_provider_order.split(",")
        if p.strip().lower() in _KNOWN_PROVIDERS
    ]
    return parsed if parsed else ["github", "microsoft", "google"]


async def verify_cursor_access_token(
    token: str,
    settings: Settings,
    *,
    hint: ProviderHint = ProviderHint.auto,
    client: httpx.AsyncClient | None = None,
) -> VerifiedCursorIdentity:
    """
    Validate ``token`` with one or more IdP userinfo endpoints.

    ``client`` is optional (tests); otherwise a short-lived AsyncClient is used.
    """
    token = token.strip()
    if not token:
        raise ValueError("empty token")

    own_client = client is None
    if own_client:
        timeout = httpx.Timeout(settings.cursor_auth_http_timeout_seconds)
        client = httpx.AsyncClient(timeout=timeout)

    try:
        order = _provider_order(settings)
        if hint != ProviderHint.auto:
            providers = [hint.value] if hint.value in _KNOWN_PROVIDERS else []
        else:
            providers = order

        for provider in providers:
            verified: VerifiedCursorIdentity | None = None
            try:
                if provider == "github":
                    verified = await verify_github_token(client, token)
                elif provider == "microsoft":
                    verified = await verify_microsoft_graph_token(client, token)
                elif provider == "google":
                    verified = await verify_google_userinfo_token(client, token)
            except httpx.HTTPError:
                logger.warning("cursor auth: provider %s HTTP error", provider, exc_info=True)
                continue
            if verified is not None:
                return verified

        logger.info("cursor auth: token did not validate with any configured provider")
        raise ValueError("invalid_or_unrecognized_token")
    finally:
        if own_client and client is not None:
            await client.aclose()
