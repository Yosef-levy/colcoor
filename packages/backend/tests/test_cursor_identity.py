"""Unit tests for IdP token verification (no database)."""

from __future__ import annotations

import asyncio

import httpx
import pytest

from colcoor_backend.core.config import Settings
from colcoor_backend.services.cursor_identity import ProviderHint, verify_cursor_access_token


def _settings(**kwargs: object) -> Settings:
    base = dict(
        env="development",
        jwt_secret="x" * 48,
        database_url="postgresql+asyncpg://x:x@localhost:5432/x",
        cursor_auth_provider_order="github,microsoft,google",
    )
    base.update(kwargs)
    return Settings(**base)


def test_verify_github_with_email() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com" and request.url.path == "/user":
            return httpx.Response(
                200,
                json={
                    "id": 42,
                    "login": "octocat",
                    "email": "octocat@github.com",
                    "avatar_url": "https://avatars.githubusercontent.com/u/1",
                },
            )
        return httpx.Response(404, json={"message": "not found"})

    async def main() -> None:
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            v = await verify_cursor_access_token(
                "gh-token",
                _settings(cursor_auth_provider_order="github"),
                hint=ProviderHint.github,
                client=client,
            )
        assert v.cursor_sub == "github:42"
        assert v.email == "octocat@github.com"
        assert v.display_name == "octocat"
        assert v.avatar_url is not None

    asyncio.run(main())


def test_verify_github_fetches_emails_when_missing() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/user":
            return httpx.Response(200, json={"id": 7, "login": "nouser", "email": None})
        if request.url.path == "/user/emails":
            return httpx.Response(
                200,
                json=[{"email": "p@ex.com", "primary": True, "verified": True}],
            )
        return httpx.Response(404)

    async def main() -> None:
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            v = await verify_cursor_access_token(
                "tok",
                _settings(),
                hint=ProviderHint.github,
                client=client,
            )
        assert v.cursor_sub == "github:7"
        assert v.email == "p@ex.com"

    asyncio.run(main())


def test_verify_microsoft_graph() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "graph.microsoft.com":
            return httpx.Response(
                200,
                json={
                    "id": "ms-id-1",
                    "mail": "user@contoso.com",
                    "displayName": "Contoso User",
                },
            )
        return httpx.Response(404)

    async def main() -> None:
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            v = await verify_cursor_access_token(
                "jwt-here",
                _settings(cursor_auth_provider_order="microsoft"),
                hint=ProviderHint.microsoft,
                client=client,
            )
        assert v.cursor_sub == "microsoft:ms-id-1"
        assert v.email == "user@contoso.com"
        assert v.display_name == "Contoso User"

    asyncio.run(main())


def test_verify_google_userinfo() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "googleapis.com" in str(request.url):
            return httpx.Response(
                200,
                json={
                    "sub": "109823",
                    "email": "g@example.com",
                    "name": "Goog User",
                    "picture": "https://lh3.googleusercontent.com/a/1",
                },
            )
        return httpx.Response(404)

    async def main() -> None:
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            v = await verify_cursor_access_token(
                "g-tok",
                _settings(cursor_auth_provider_order="google"),
                hint=ProviderHint.google,
                client=client,
            )
        assert v.cursor_sub == "google:109823"
        assert v.email == "g@example.com"

    asyncio.run(main())


def test_invalid_token_raises() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401)

    async def main() -> None:
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            with pytest.raises(ValueError, match="invalid_or_unrecognized_token"):
                await verify_cursor_access_token(
                    "bad",
                    _settings(),
                    hint=ProviderHint.github,
                    client=client,
                )

    asyncio.run(main())
