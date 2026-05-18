"""Per-user and per-IP rate limiting middleware."""

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


def _rate_limit_env(*, burst_user: str = "2", burst_anon: str = "2") -> dict[str, str]:
    return {
        "RATE_LIMIT_ENABLED": "true",
        "RATE_LIMIT_RPS_PER_USER": "0",
        "RATE_LIMIT_BURST_PER_USER": burst_user,
        "RATE_LIMIT_RPS_ANON": "0",
        "RATE_LIMIT_BURST_ANON": burst_anon,
    }


def test_same_user_exceeding_limit_gets_429(monkeypatch) -> None:
    with _client(monkeypatch, **_rate_limit_env()) as client:
        token = create_access_token(uuid.uuid4(), get_settings())
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/v1/health", headers=headers).status_code == 200
        assert client.get("/api/v1/health", headers=headers).status_code == 200
        response = client.get("/api/v1/health", headers=headers)
        assert response.status_code == 429
        assert response.json() == {"detail": "Rate limit exceeded. Try again shortly."}


def test_different_users_counted_separately(monkeypatch) -> None:
    with _client(monkeypatch, **_rate_limit_env()) as client:
        settings = get_settings()
        token_a = create_access_token(uuid.uuid4(), settings)
        token_b = create_access_token(uuid.uuid4(), settings)
        for _ in range(2):
            assert client.get(
                "/api/v1/health",
                headers={"Authorization": f"Bearer {token_a}"},
            ).status_code == 200
        assert (
            client.get(
                "/api/v1/health",
                headers={"Authorization": f"Bearer {token_a}"},
            ).status_code
            == 429
        )
        assert (
            client.get(
                "/api/v1/health",
                headers={"Authorization": f"Bearer {token_b}"},
            ).status_code
            == 200
        )


def test_unauthenticated_requests_use_ip_fallback(monkeypatch) -> None:
    with _client(monkeypatch, **_rate_limit_env()) as client:
        assert client.get("/api/v1/health").status_code == 200
        assert client.get("/api/v1/health").status_code == 200
        assert client.get("/api/v1/health").status_code == 429


def test_health_and_ready_never_limited(monkeypatch) -> None:
    with _client(monkeypatch, **_rate_limit_env(burst_user="1", burst_anon="1")) as client:
        for _ in range(20):
            assert client.get("/health").status_code == 200
            assert client.get("/ready").status_code == 200


def test_rate_limit_disabled(monkeypatch) -> None:
    with _client(
        monkeypatch,
        RATE_LIMIT_ENABLED="false",
        RATE_LIMIT_BURST_ANON="1",
        RATE_LIMIT_RPS_ANON="0",
    ) as client:
        for _ in range(5):
            assert client.get("/api/v1/health").status_code == 200


def test_invalid_bearer_uses_ip_bucket(monkeypatch) -> None:
    with _client(monkeypatch, **_rate_limit_env()) as client:
        headers = {"Authorization": "Bearer not-a-valid-jwt"}
        assert client.get("/api/v1/health", headers=headers).status_code == 200
        assert client.get("/api/v1/health", headers=headers).status_code == 200
        assert client.get("/api/v1/health", headers=headers).status_code == 429


def test_expired_jwt_falls_back_to_ip_without_crash(monkeypatch) -> None:
    with _client(monkeypatch, **_rate_limit_env()) as client:
        settings = get_settings()
        expired = jwt.encode(
            {
                "sub": str(uuid.uuid4()),
                "exp": int((datetime.now(tz=UTC) - timedelta(hours=1)).timestamp()),
            },
            settings.jwt_secret,
            algorithm="HS256",
        )
        headers = {"Authorization": f"Bearer {expired}"}
        assert client.get("/api/v1/health", headers=headers).status_code == 200
        assert client.get("/api/v1/health", headers=headers).status_code == 200
        assert client.get("/api/v1/health", headers=headers).status_code == 429


def test_malformed_sub_falls_back_to_ip_without_crash(monkeypatch) -> None:
    with _client(monkeypatch, **_rate_limit_env()) as client:
        settings = get_settings()
        bad_sub = jwt.encode(
            {
                "sub": "not-a-uuid",
                "exp": int((datetime.now(tz=UTC) + timedelta(hours=1)).timestamp()),
            },
            settings.jwt_secret,
            algorithm="HS256",
        )
        headers = {"Authorization": f"Bearer {bad_sub}"}
        assert client.get("/api/v1/health", headers=headers).status_code == 200
        assert client.get("/api/v1/health", headers=headers).status_code == 200
        assert client.get("/api/v1/health", headers=headers).status_code == 429


def test_429_includes_request_id(monkeypatch) -> None:
    with _client(monkeypatch, **_rate_limit_env(burst_user="1")) as client:
        token = create_access_token(uuid.uuid4(), get_settings())
        headers = {"Authorization": f"Bearer {token}", "X-Request-ID": "rate-limit-test-rid"}
        assert client.get("/api/v1/health", headers=headers).status_code == 200
        response = client.get("/api/v1/health", headers=headers)
        assert response.status_code == 429
        assert response.headers.get("X-Request-ID") == "rate-limit-test-rid"


def test_x_forwarded_for_ignored_without_trust_proxy(monkeypatch) -> None:
    with _client(monkeypatch, **_rate_limit_env(), RATE_LIMIT_TRUST_PROXY="false") as client:
        headers = {"X-Forwarded-For": "203.0.113.1"}
        assert client.get("/api/v1/health", headers=headers).status_code == 200
        assert client.get("/api/v1/health", headers=headers).status_code == 200
        assert client.get("/api/v1/health", headers=headers).status_code == 429
        fresh_ip = {"X-Forwarded-For": "203.0.113.99"}
        assert client.get("/api/v1/health", headers=fresh_ip).status_code == 429


def test_x_forwarded_for_used_when_trust_proxy(monkeypatch) -> None:
    with _client(monkeypatch, **_rate_limit_env(), RATE_LIMIT_TRUST_PROXY="true") as client:
        ip_a = {"X-Forwarded-For": "203.0.113.1"}
        assert client.get("/api/v1/health", headers=ip_a).status_code == 200
        assert client.get("/api/v1/health", headers=ip_a).status_code == 200
        assert client.get("/api/v1/health", headers=ip_a).status_code == 429
        ip_b = {"X-Forwarded-For": "203.0.113.99"}
        assert client.get("/api/v1/health", headers=ip_b).status_code == 200


def test_colcoor_env_aliases(monkeypatch) -> None:
    with _client(
        monkeypatch,
        COLCOOR_RATE_LIMIT_ENABLED="true",
        COLCOOR_RATE_LIMIT_RPS_PER_USER="0",
        COLCOOR_RATE_LIMIT_BURST_PER_USER="1",
        COLCOOR_RATE_LIMIT_RPS_ANON="0",
        COLCOOR_RATE_LIMIT_BURST_ANON="2",
    ) as client:
        token = create_access_token(uuid.uuid4(), get_settings())
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/v1/health", headers=headers).status_code == 200
        assert client.get("/api/v1/health", headers=headers).status_code == 429
