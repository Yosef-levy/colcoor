"""Centralized API error envelope and exception handlers."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi.testclient import TestClient

from colcoor_backend.app import create_app
from colcoor_backend.core.config import get_settings
from colcoor_backend.core.jwt_tokens import create_access_token


def _client(monkeypatch, **env: str) -> TestClient:
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-at-least-32-chars-long")
    get_settings.cache_clear()
    return TestClient(create_app())


def test_http_exception_returns_error_envelope() -> None:
    client = TestClient(create_app())
    response = client.get("/api/v1/me")
    assert response.status_code == 401
    body = response.json()
    assert body["error"]["code"] == "unauthorized"
    assert body["error"]["message"]
    assert body["error"]["request_id"]
    assert response.headers.get("X-Request-ID") == body["error"]["request_id"]


def test_validation_error_envelope(monkeypatch) -> None:
    from unittest.mock import AsyncMock

    from colcoor_backend.api.deps import get_db

    async def mock_db():
        session = AsyncMock()
        yield session

    app = create_app()
    app.dependency_overrides[get_db] = mock_db
    client = TestClient(app)
    response = client.post(
        "/api/v1/auth/cursor",
        headers={"Content-Type": "application/json"},
        json={"cursor_access_token": ""},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["request_id"]


def test_rate_limit_uses_error_envelope(monkeypatch) -> None:
    with _client(
        monkeypatch,
        RATE_LIMIT_ENABLED="true",
        RATE_LIMIT_RPS_PER_USER="0",
        RATE_LIMIT_BURST_PER_USER="1",
    ) as client:
        token = create_access_token(uuid.uuid4(), get_settings())
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/v1/health", headers=headers).status_code == 200
        response = client.get("/api/v1/health", headers=headers)
        assert response.status_code == 429
        body = response.json()
        assert body["error"]["code"] == "rate_limited"
        assert body["error"]["request_id"]


def test_expired_jwt_maps_to_unauthorized_envelope(monkeypatch) -> None:
    with _client(monkeypatch) as client:
        settings = get_settings()
        expired = jwt.encode(
            {
                "sub": str(uuid.uuid4()),
                "exp": int((datetime.now(tz=UTC) - timedelta(hours=1)).timestamp()),
            },
            settings.jwt_secret,
            algorithm="HS256",
        )
        response = client.get("/api/v1/me", headers={"Authorization": f"Bearer {expired}"})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "unauthorized"


def test_request_id_preserved_from_client() -> None:
    client = TestClient(create_app())
    rid = "client-req-id-abc"
    response = client.get("/api/v1/me", headers={"X-Request-ID": rid})
    assert response.json()["error"]["request_id"] == rid
    assert response.headers.get("X-Request-ID") == rid
