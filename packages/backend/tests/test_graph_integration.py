"""Graph persistence and append-event HTTP flow.

Requires Postgres and ``COLCOOR_TEST_DATABASE_URL`` (e.g. ``postgresql+asyncpg://user:pass@host:5432/db``).
When unset, tests in this module are skipped so ``pytest`` stays green in CI without a database.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from colcoor_backend.app import create_app
from colcoor_backend.core.config import get_settings
from colcoor_backend.core.jwt_tokens import create_access_token
from colcoor_backend.db import models  # noqa: F401 — register mappers
from colcoor_backend.db.base import Base
from colcoor_backend.db.models import ConversationUserState, User
from colcoor_backend.services.graph import (
    append_graph_event,
    create_conversation_with_owner,
    list_events_for_tree,
)
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

pytestmark = pytest.mark.skipif(
    not os.environ.get("COLCOOR_TEST_DATABASE_URL"),
    reason="COLCOOR_TEST_DATABASE_URL not set (postgresql+asyncpg://…)",
)


async def _seed_user_and_mint_jwt(postgres_url: str) -> str:
    """Insert a user and return a JWT for HTTP tests (no dev-login route)."""
    eng = create_async_engine(postgres_url)
    factory = async_sessionmaker(eng, expire_on_commit=False)
    async with factory() as s:
        u = User(
            cursor_sub=f"int-{uuid.uuid4()}",
            email="i@i.c",
            display_name="",
            last_login_at=datetime.now(tz=UTC),
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
        token = create_access_token(u.id, get_settings())
    await eng.dispose()
    return token


@pytest.fixture(scope="module")
def postgres_url() -> str:
    url = os.environ["COLCOOR_TEST_DATABASE_URL"].strip()
    assert url.startswith("postgresql"), "use postgresql+asyncpg:// for async SQLAlchemy"
    return url


@pytest.fixture(scope="module")
def async_engine(postgres_url: str) -> Iterator[AsyncEngine]:
    eng = create_async_engine(postgres_url)

    async def reset() -> None:
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(reset())
    yield eng
    asyncio.run(eng.dispose())


@pytest.fixture(autouse=True)
def _clean_tables(async_engine: AsyncEngine) -> None:
    async def reset() -> None:
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(reset())


@pytest.fixture
def session_factory(async_engine: AsyncEngine):
    return async_sessionmaker(async_engine, expire_on_commit=False, autoflush=False)


def test_append_graph_event_sets_active_event_id(session_factory) -> None:
    """Regression: Event.id is server-generated; active_event_id must not be set before flush."""

    async def run() -> None:
        async with session_factory() as s:
            u = User(
                cursor_sub=f"sub-{uuid.uuid4()}",
                email="a@b.c",
                display_name="t",
                last_login_at=datetime.now(tz=UTC),
            )
            s.add(u)
            await s.flush()
            await s.refresh(u)
            uid = u.id
            conv, _ = await create_conversation_with_owner(s, user_id=uid, title="x")
            await s.commit()

        async with session_factory() as s:
            evs = await list_events_for_tree(s, conv.id, uid)
            tip = evs[-1]
            u_ev = await append_graph_event(
                s,
                conversation_id=conv.id,
                user_id=uid,
                kind="user_input",
                parent_event_id=tip.id,
                content="hello",
                private_branch=False,
            )
            a_ev = await append_graph_event(
                s,
                conversation_id=conv.id,
                user_id=uid,
                kind="assistant_output",
                parent_event_id=u_ev.id,
                content="world",
                private_branch=False,
            )
            await s.commit()
            st = await s.get(ConversationUserState, (conv.id, uid))
            assert st is not None
            assert st.active_event_id == a_ev.id
            assert u_ev.id is not None and a_ev.id is not None

    asyncio.run(run())


def test_append_assistant_rejects_non_user_parent(session_factory) -> None:
    async def run() -> None:
        async with session_factory() as s:
            u = User(
                cursor_sub=f"sub-{uuid.uuid4()}",
                email="b@b.c",
                display_name="t",
                last_login_at=datetime.now(tz=UTC),
            )
            s.add(u)
            await s.flush()
            await s.refresh(u)
            uid = u.id
            conv, _ = await create_conversation_with_owner(s, user_id=uid, title="y")
            await s.commit()

        async with session_factory() as s:
            evs = await list_events_for_tree(s, conv.id, uid)
            tip = evs[-1]
            u_ev = await append_graph_event(
                s,
                conversation_id=conv.id,
                user_id=uid,
                kind="user_input",
                parent_event_id=tip.id,
                content="hi",
                private_branch=False,
            )
            a_ev = await append_graph_event(
                s,
                conversation_id=conv.id,
                user_id=uid,
                kind="assistant_output",
                parent_event_id=u_ev.id,
                content="first reply",
                private_branch=False,
            )
            await s.commit()

        async with session_factory() as s:
            with pytest.raises(ValueError, match="assistant_output must attach"):
                await append_graph_event(
                    s,
                    conversation_id=conv.id,
                    user_id=uid,
                    kind="assistant_output",
                    parent_event_id=a_ev.id,
                    content="bad parent",
                    private_branch=False,
                )

    asyncio.run(run())


def test_append_event_http_roundtrip(monkeypatch: pytest.MonkeyPatch, postgres_url: str) -> None:
    secret = "x" * 40
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setenv("JWT_SECRET", secret)
    monkeypatch.setenv("COLCOOR_ENV", "development")
    get_settings.cache_clear()
    token = asyncio.run(_seed_user_and_mint_jwt(postgres_url))
    auth = {"Authorization": f"Bearer {token}"}

    with TestClient(create_app()) as client:

        r = client.post("/api/v1/conversations", headers=auth, json={"title": "api"})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        r = client.get(f"/api/v1/conversations/{cid}/members", headers=auth)
        assert r.status_code == 200, r.text
        mems = r.json()
        assert len(mems) == 1
        assert mems[0]["role"] == "owner"
        assert mems[0]["user_id"]

        r = client.get(f"/api/v1/conversations/{cid}/tree", headers=auth)
        assert r.status_code == 200, r.text
        root = next(e for e in r.json()["events"] if e["parent_event_id"] is None)

        r = client.get(f"/api/v1/conversations/{cid}/caller-state", headers=auth)
        assert r.status_code == 200, r.text
        cstate = r.json()
        assert cstate["active_event_id"] == root["id"]
        assert cstate["needs_context_rebuild"] is False

        r = client.post(
            f"/api/v1/conversations/{cid}/active",
            headers=auth,
            json={"active_event_id": root["id"], "needs_context_rebuild": False},
        )
        assert r.status_code == 200, r.text
        act = r.json()
        assert act["active_event_id"] == root["id"]
        assert act["needs_context_rebuild"] is False

        r = client.post(
            f"/api/v1/conversations/{cid}/active",
            headers=auth,
            json={"active_event_id": str(uuid.uuid4()), "needs_context_rebuild": True},
        )
        assert r.status_code == 422, r.text

        r = client.post(
            f"/api/v1/conversations/{cid}/append-event",
            headers=auth,
            json={
                "kind": "user_input",
                "parent_event_id": root["id"],
                "content": "from test",
                "author": "end_user",
                "private_branch": False,
            },
        )
        assert r.status_code == 200, r.text
        user_ev_id = r.json()["id"]

        r = client.post(
            f"/api/v1/conversations/{cid}/append-event",
            headers=auth,
            json={
                "kind": "assistant_output",
                "parent_event_id": user_ev_id,
                "content": "from assistant",
                "author": "cursor_agent",
                "private_branch": False,
                "content_json": {
                    "colcoor_agent_trace": {
                        "version": 1,
                        "entries": [{"type": "tool_call", "subtype": "started"}],
                    }
                },
            },
        )
        assert r.status_code == 200, r.text

        r = client.post(
            f"/api/v1/conversations/{cid}/notes",
            headers=auth,
            json={"event_id": user_ev_id, "content": "integration note"},
        )
        assert r.status_code == 200, r.text
        note_row = r.json()
        assert note_row["content"] == "integration note"

        r = client.get(f"/api/v1/conversations/{cid}/notes", headers=auth)
        assert r.status_code == 200, r.text
        assert len(r.json()) == 1

        r = client.put(
            f"/api/v1/conversations/{cid}/events/{user_ev_id}/star",
            headers=auth,
        )
        assert r.status_code == 204, r.text

        r = client.get(f"/api/v1/conversations/{cid}/tree", headers=auth)
        assert r.status_code == 200, r.text
        body = r.json()
        user_ev = next(e for e in body["events"] if e["id"] == user_ev_id)
        assert user_ev["note_count"] == 1
        assert user_ev["starred"] is True
        asst = next(e for e in body["events"] if e.get("content_text") == "from assistant")
        assert asst["content_json"]["colcoor_agent_trace"]["version"] == 1
        assert asst["content_json"]["colcoor_agent_trace"]["entries"][0]["type"] == "tool_call"

        r = client.delete(f"/api/v1/conversations/{cid}", headers=auth)
        assert r.status_code == 204, r.text

        r = client.get(f"/api/v1/conversations/{cid}/tree", headers=auth)
        assert r.status_code == 404, r.text

        r = client.get("/api/v1/conversations", headers=auth)
        assert r.status_code == 200, r.text
        assert cid not in {row["id"] for row in r.json()}

    get_settings.cache_clear()


def test_conversation_membership_mutations_http(monkeypatch: pytest.MonkeyPatch, postgres_url: str) -> None:
    """POST/PATCH/DELETE /conversations/{id}/members (api-contracts §4.2–4.4)."""
    from colcoor_backend.core.jwt_tokens import decode_access_token

    secret = "x" * 40
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setenv("JWT_SECRET", secret)
    monkeypatch.setenv("COLCOOR_ENV", "development")
    get_settings.cache_clear()
    token_owner = asyncio.run(_seed_user_and_mint_jwt(postgres_url))
    token_viewer = asyncio.run(_seed_user_and_mint_jwt(postgres_url))
    token_editor = asyncio.run(_seed_user_and_mint_jwt(postgres_url))
    settings = get_settings()
    uid_viewer = decode_access_token(token_viewer, settings)
    uid_editor = decode_access_token(token_editor, settings)
    auth_owner = {"Authorization": f"Bearer {token_owner}"}
    auth_viewer = {"Authorization": f"Bearer {token_viewer}"}

    with TestClient(create_app()) as client:
        r = client.post("/api/v1/conversations", headers=auth_owner, json={"title": "members"})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        r = client.post(
            f"/api/v1/conversations/{cid}/members",
            headers=auth_owner,
            json={"user_id": str(uid_viewer), "role": "viewer"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "viewer"

        r = client.post(
            f"/api/v1/conversations/{cid}/members",
            headers=auth_owner,
            json={"user_id": str(uid_viewer), "role": "editor"},
        )
        assert r.status_code == 409, r.text

        r = client.post(
            f"/api/v1/conversations/{cid}/members",
            headers=auth_viewer,
            json={"user_id": str(uid_editor), "role": "editor"},
        )
        assert r.status_code == 403, r.text

        r = client.post(
            f"/api/v1/conversations/{cid}/members",
            headers=auth_owner,
            json={"user_id": str(uid_editor), "role": "editor"},
        )
        assert r.status_code == 200, r.text

        r = client.get(f"/api/v1/conversations/{cid}/members", headers=auth_owner)
        assert r.status_code == 200, r.text
        assert len(r.json()) == 3

        r = client.delete(f"/api/v1/conversations/{cid}/members/{uid_editor}", headers=auth_owner)
        assert r.status_code == 204, r.text

        r = client.get(f"/api/v1/conversations/{cid}/members", headers=auth_owner)
        assert len(r.json()) == 2

        r = client.patch(
            f"/api/v1/conversations/{cid}/members/{uid_viewer}",
            headers=auth_owner,
            json={"role": "editor"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "editor"

        r = client.delete(f"/api/v1/conversations/{cid}", headers=auth_owner)
        assert r.status_code == 204, r.text

    get_settings.cache_clear()
