"""Licensing: seat limits, error envelope, safe logging."""

from __future__ import annotations

import logging
import os
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from colcoor_backend.app import create_app
from colcoor_backend.core.config import get_settings
from colcoor_backend.core.jwt_tokens import create_access_token
from colcoor_backend.db import models  # noqa: F401
from colcoor_backend.db.base import Base
from colcoor_backend.db.models import User
from colcoor_backend.errors.logging_utils import redact_secrets
from colcoor_backend.licensing.exceptions import LicenseUserLimitReached
from colcoor_backend.licensing.service import check_can_register_new_user
from colcoor_backend.licensing.types import DEFAULT_MAX_USERS_BY_LICENSE_TYPE
from colcoor_backend.services.cursor_identity import VerifiedCursorIdentity
from colcoor_backend.services.graph import upsert_user_from_verified_identity

def test_free_license_default_max_users(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("COLCOOR_LICENSE_MAX_USERS", raising=False)
    monkeypatch.setenv("COLCOOR_LICENSE_TYPE", "free")
    get_settings.cache_clear()
    assert get_settings().resolved_license_max_users() == DEFAULT_MAX_USERS_BY_LICENSE_TYPE["free"]
    get_settings.cache_clear()


def test_check_blocks_fourth_user(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COLCOOR_LICENSE_MAX_USERS", "3")
    get_settings.cache_clear()
    settings = get_settings()
    with pytest.raises(LicenseUserLimitReached):
        check_can_register_new_user(3, settings)
    get_settings.cache_clear()


def test_invalid_deployment_profile_fails_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COLCOOR_DEPLOYMENT_PROFILE", "not-a-real-profile")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="COLCOOR_DEPLOYMENT_PROFILE"):
        create_app()
    get_settings.cache_clear()


def test_license_key_redacted_in_logs() -> None:
    raw = "COLCOOR_LICENSE_KEY=ls_secret_key_abc123xyz"
    redacted = redact_secrets(raw)
    assert "ls_secret_key_abc123xyz" not in redacted
    assert redacted == "COLCOOR_LICENSE_KEY=***"


def test_license_limit_error_envelope(monkeypatch: pytest.MonkeyPatch) -> None:
    from colcoor_backend.api.deps import get_db

    async def mock_db():
        session = AsyncMock()
        yield session

    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-at-least-32-chars-long")
    get_settings.cache_clear()
    app = create_app()
    app.dependency_overrides[get_db] = mock_db

    verified = VerifiedCursorIdentity(
        cursor_sub="sub-new",
        email="n@example.com",
        display_name="New",
        avatar_url=None,
    )

    with (
        patch(
            "colcoor_backend.api.routes.auth.verify_cursor_access_token",
            new_callable=AsyncMock,
            return_value=verified,
        ),
        patch(
            "colcoor_backend.api.routes.auth.upsert_user_from_verified_identity",
            new_callable=AsyncMock,
            side_effect=LicenseUserLimitReached("seat cap hit"),
        ),
    ):
        client = TestClient(app)
        response = client.post(
            "/api/v1/auth/cursor",
            json={"cursor_access_token": "tok", "provider_hint": "github"},
        )

    assert response.status_code == 403
    body = response.json()
    assert body["error"]["code"] == "license_user_limit_reached"
    assert body["error"]["message"]
    assert body["error"]["request_id"]


@pytest.mark.skipif(
    not os.environ.get("COLCOOR_TEST_DATABASE_URL"),
    reason="COLCOOR_TEST_DATABASE_URL not set",
)
def test_blocks_fourth_user_creation(postgres_url: str, monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    monkeypatch.setenv("COLCOOR_LICENSE_MAX_USERS", "3")
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-at-least-32-chars-long")
    get_settings.cache_clear()
    settings = get_settings()

    async def run() -> None:
        eng = create_async_engine(postgres_url)
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(eng, expire_on_commit=False)

        async with factory() as session:
            for i in range(3):
                session.add(
                    User(
                        cursor_sub=f"existing-{i}",
                        email=f"u{i}@example.com",
                        display_name="",
                        last_login_at=datetime.now(tz=UTC),
                    )
                )
            await session.commit()

        identity = VerifiedCursorIdentity(
            cursor_sub="brand-new-sub",
            email="new@example.com",
            display_name="New",
            avatar_url=None,
        )
        async with factory() as session:
            with pytest.raises(LicenseUserLimitReached):
                await upsert_user_from_verified_identity(session, identity, settings=settings)

        await eng.dispose()

    asyncio.run(run())
    get_settings.cache_clear()


@pytest.mark.skipif(
    not os.environ.get("COLCOOR_TEST_DATABASE_URL"),
    reason="COLCOOR_TEST_DATABASE_URL not set",
)
def test_existing_user_sign_in_when_over_limit(
    postgres_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    import asyncio

    monkeypatch.setenv("COLCOOR_LICENSE_MAX_USERS", "3")
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-at-least-32-chars-long")
    get_settings.cache_clear()
    settings = get_settings()

    async def run() -> None:
        eng = create_async_engine(postgres_url)
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(eng, expire_on_commit=False)

        async with factory() as session:
            for i in range(4):
                session.add(
                    User(
                        cursor_sub=f"legacy-{i}",
                        email=f"legacy{i}@example.com",
                        display_name="",
                        last_login_at=datetime.now(tz=UTC),
                    )
                )
            await session.commit()

        identity = VerifiedCursorIdentity(
            cursor_sub="legacy-0",
            email="legacy0@example.com",
            display_name="Back",
            avatar_url=None,
        )
        async with factory() as session:
            uid = await upsert_user_from_verified_identity(session, identity, settings=settings)
            await session.commit()
            assert uid is not None

        await eng.dispose()

    asyncio.run(run())
    get_settings.cache_clear()


@pytest.mark.skipif(
    not os.environ.get("COLCOOR_TEST_DATABASE_URL"),
    reason="COLCOOR_TEST_DATABASE_URL not set",
)
def test_license_status_endpoint(postgres_url: str, monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setenv("COLCOOR_LICENSE_MAX_USERS", "3")
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-at-least-32-chars-long")
    monkeypatch.setenv("COLCOOR_LICENSE_KEY", "ls_test_key_do_not_log")
    get_settings.cache_clear()

    async def seed_user() -> uuid.UUID:
        eng = create_async_engine(postgres_url)
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(eng, expire_on_commit=False)

        async with factory() as session:
            u = User(
                cursor_sub="status-user",
                email="s@example.com",
                display_name="",
                last_login_at=datetime.now(tz=UTC),
            )
            session.add(u)
            await session.commit()
            await session.refresh(u)
            user_id = u.id

        await eng.dispose()
        return user_id

    user_id = asyncio.run(seed_user())

    with TestClient(create_app()) as client:
        token = create_access_token(user_id, get_settings())
        response = client.get(
            "/api/v1/system/license",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["license_type"] == "free"
    assert data["max_users"] == 3
    assert data["current_users"] == 1
    assert data["license_key_present"] is True
    assert "ls_test_key" not in response.text
    get_settings.cache_clear()


def test_startup_log_does_not_contain_license_key(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("COLCOOR_LICENSE_KEY", "ls_super_secret_key_value")
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-at-least-32-chars-long")
    get_settings.cache_clear()

    with caplog.at_level(logging.INFO):
        with TestClient(create_app()) as client:
            client.get("/health")

    combined = " ".join(r.getMessage() for r in caplog.records)
    assert "ls_super_secret_key_value" not in combined
    get_settings.cache_clear()
