"""Tests for append-event idempotency (Idempotency-Key header)."""

from __future__ import annotations

import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine

from colcoor_backend.app import create_app
from colcoor_backend.core.config import get_settings
from colcoor_backend.db.base import Base
from colcoor_backend.services.append_event_idempotency import (
    IDEMPOTENCY_KEY_HEADER,
    normalize_idempotency_key,
)
import colcoor_backend.db.models  # noqa: F401 — register mappers


@pytest.fixture(autouse=True)
def _ensure_schema(postgres_url: str) -> None:
    async def reset() -> None:
        eng = create_async_engine(postgres_url)
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        await eng.dispose()

    asyncio.run(reset())


def test_normalize_idempotency_key_rejects_empty() -> None:
    with pytest.raises(ValueError, match="required"):
        normalize_idempotency_key(None)
    with pytest.raises(ValueError, match="required"):
        normalize_idempotency_key("   ")


def test_normalize_idempotency_key_accepts_uuid() -> None:
    key = str(uuid.uuid4())
    assert normalize_idempotency_key(key) == key


@pytest.fixture
def graph_client(monkeypatch: pytest.MonkeyPatch, postgres_url: str) -> TestClient:
    secret = "x" * 40
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setenv("JWT_SECRET", secret)
    monkeypatch.setenv("COLCOOR_ENV", "development")
    get_settings.cache_clear()
    with TestClient(create_app()) as client:
        yield client


def _auth_token(postgres_url: str) -> str:
    from colcoor_backend.core.jwt_tokens import create_access_token
    from colcoor_backend.db.session import create_engine, create_session_factory
    from colcoor_backend.services.graph import upsert_user_from_verified_identity
    from colcoor_backend.services.cursor_identity import VerifiedCursorIdentity

    async def _seed() -> str:
        engine = create_engine(postgres_url)
        factory = create_session_factory(engine)
        async with factory() as session:
            uid = await upsert_user_from_verified_identity(
                session,
                VerifiedCursorIdentity(
                    cursor_sub="idempotency-test-sub",
                    email="idempotency@test.example",
                    display_name="Idempotency Test",
                    avatar_url=None,
                ),
            )
            await session.commit()
        await engine.dispose()
        return str(create_access_token(uid, get_settings()))

    return asyncio.run(_seed())


def test_append_event_requires_idempotency_key(graph_client: TestClient, postgres_url: str) -> None:
    token = _auth_token(postgres_url)
    auth = {"Authorization": f"Bearer {token}"}
    r = graph_client.post("/api/v1/conversations", headers=auth, json={"title": "idem"})
    assert r.status_code == 200
    cid = r.json()["id"]
    tree = graph_client.get(f"/api/v1/conversations/{cid}/tree", headers=auth)
    root = next(e for e in tree.json()["events"] if e["parent_event_id"] is None)
    r = graph_client.post(
        f"/api/v1/conversations/{cid}/append-event",
        headers=auth,
        json={
            "kind": "user_input",
            "parent_event_id": root["id"],
            "content": "hello",
            "author": "end_user",
        },
    )
    assert r.status_code == 422
    assert "Idempotency-Key" in r.json()["error"]["message"]


def test_append_event_idempotency_replays_same_event(graph_client: TestClient, postgres_url: str) -> None:
    token = _auth_token(postgres_url)
    auth = {"Authorization": f"Bearer {token}"}
    r = graph_client.post("/api/v1/conversations", headers=auth, json={"title": "idem2"})
    cid = r.json()["id"]
    tree = graph_client.get(f"/api/v1/conversations/{cid}/tree", headers=auth)
    root = next(e for e in tree.json()["events"] if e["parent_event_id"] is None)
    idem_key = str(uuid.uuid4())
    body = {
        "kind": "user_input",
        "parent_event_id": root["id"],
        "content": "once",
        "author": "end_user",
    }
    headers = {**auth, IDEMPOTENCY_KEY_HEADER: idem_key}
    r1 = graph_client.post(f"/api/v1/conversations/{cid}/append-event", headers=headers, json=body)
    assert r1.status_code == 200, r1.text
    data1 = r1.json()
    assert data1["replayed"] is False
    r2 = graph_client.post(f"/api/v1/conversations/{cid}/append-event", headers=headers, json=body)
    assert r2.status_code == 200, r2.text
    data2 = r2.json()
    assert data2["replayed"] is True
    assert data2["id"] == data1["id"]
    tree_after = graph_client.get(f"/api/v1/conversations/{cid}/tree", headers=auth).json()["events"]
    user_events = [e for e in tree_after if e["kind"] == "user_input" and e["content_text"] == "once"]
    assert len(user_events) == 1
