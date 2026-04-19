"""Graph persistence and append-event HTTP flow.

Requires Postgres and ``COLCOOR_TEST_DATABASE_URL`` (e.g. ``postgresql+asyncpg://user:pass@host:5432/db``).
When unset, tests in this module are skipped so ``pytest`` stays green in CI without a database.
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from colcoor_backend.app import create_app
from colcoor_backend.core.config import get_settings
from colcoor_backend.core.jwt_tokens import create_access_token
from colcoor_backend.db import models  # noqa: F401 — register mappers
from colcoor_backend.db.base import Base
from colcoor_backend.db.models import ConversationUserState, Event, User
from colcoor_backend.services.event_purge import purge_soft_deleted_events
from colcoor_backend.services.graph import (
    append_graph_event,
    create_conversation_with_owner,
    create_note_on_event,
    list_events_for_tree,
    soft_delete_event_subtree,
)
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
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


def test_assistant_output_inherits_visible_to_from_private_user(session_factory) -> None:
    """Assistant rows under a private draft share the same user-only scope as the parent user line."""

    async def run() -> None:
        async with session_factory() as s:
            u = User(
                cursor_sub=f"sub-{uuid.uuid4()}",
                email="pvt@pvt.c",
                display_name="t",
                last_login_at=datetime.now(tz=UTC),
            )
            s.add(u)
            await s.flush()
            await s.refresh(u)
            uid = u.id
            conv, _ = await create_conversation_with_owner(s, user_id=uid, title="priv")
            await s.commit()

        async with session_factory() as s:
            evs = await list_events_for_tree(s, conv.id, uid)
            tip = evs[-1]
            u_priv = await append_graph_event(
                s,
                conversation_id=conv.id,
                user_id=uid,
                kind="user_input",
                parent_event_id=tip.id,
                content="draft",
                private_branch=True,
            )
            assert u_priv.visible_to == uid
            a_ev = await append_graph_event(
                s,
                conversation_id=conv.id,
                user_id=uid,
                kind="assistant_output",
                parent_event_id=u_priv.id,
                content="assistant reply",
                private_branch=False,
            )
            assert a_ev.visible_to == uid
            await s.commit()

        async with session_factory() as s:
            tree = await list_events_for_tree(s, conv.id, uid)
            by_id = {e.id: e for e in tree}
            assert by_id[u_priv.id].visible_to == uid
            assert by_id[a_ev.id].visible_to == uid

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
        assert cstate.get("side_chat_last_read_seq", 0) == 0

        r = client.post(
            f"/api/v1/conversations/{cid}/active",
            headers=auth,
            json={"active_event_id": root["id"], "needs_context_rebuild": False},
        )
        assert r.status_code == 200, r.text
        act = r.json()
        assert act["active_event_id"] == root["id"]
        assert act["needs_context_rebuild"] is False
        assert act.get("side_chat_last_read_seq", 0) == 0

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
                "checkpoint_label": "  Branch A  ",
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
        assert user_ev.get("checkpoint_label") == "Branch A"
        assert user_ev["note_count"] == 1
        assert user_ev["starred"] is True
        asst = next(e for e in body["events"] if e.get("content_text") == "from assistant")
        assert asst["content_json"]["colcoor_agent_trace"]["version"] == 1
        assert asst["content_json"]["colcoor_agent_trace"]["entries"][0]["type"] == "tool_call"

        r = client.patch(
            f"/api/v1/conversations/{cid}/events/{user_ev_id}/checkpoint-label",
            headers=auth,
            json={"checkpoint_label": "patched title"},
        )
        assert r.status_code == 204, r.text
        r = client.get(f"/api/v1/conversations/{cid}/tree", headers=auth)
        assert r.status_code == 200, r.text
        user_ev = next(e for e in r.json()["events"] if e["id"] == user_ev_id)
        assert user_ev.get("checkpoint_label") == "patched title"

        r = client.patch(
            f"/api/v1/conversations/{cid}/events/{user_ev_id}/checkpoint-label",
            headers=auth,
            json={"checkpoint_label": None},
        )
        assert r.status_code == 204, r.text
        r = client.get(f"/api/v1/conversations/{cid}/tree", headers=auth)
        assert r.status_code == 200, r.text
        user_ev = next(e for e in r.json()["events"] if e["id"] == user_ev_id)
        assert user_ev.get("checkpoint_label") is None

        r = client.delete(f"/api/v1/conversations/{cid}", headers=auth)
        assert r.status_code == 200, r.text
        del_body = r.json()
        assert del_body["deleted_count"] >= 1
        assert del_body["deletion_group_id"]

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

        r = client.patch(
            f"/api/v1/conversations/{cid}/members/{uid_editor}",
            headers=auth_viewer,
            json={"role": "owner"},
        )
        assert r.status_code == 403, r.text

        r = client.delete(f"/api/v1/conversations/{cid}/members/{uid_editor}", headers=auth_viewer)
        assert r.status_code == 403, r.text

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
        assert r.status_code == 200, r.text
        assert r.json()["deletion_group_id"]

    get_settings.cache_clear()


async def _insert_user_row(postgres_url: str, **kwargs: object) -> uuid.UUID:
    eng = create_async_engine(postgres_url)
    factory = async_sessionmaker(eng, expire_on_commit=False)
    async with factory() as s:
        u = User(**kwargs)
        s.add(u)
        await s.commit()
        await s.refresh(u)
        uid = u.id
    await eng.dispose()
    return uid


def test_member_invite_search_http(monkeypatch: pytest.MonkeyPatch, postgres_url: str) -> None:
    """GET …/member-invite-search (api-contracts §4.1a)."""
    from colcoor_backend.core.jwt_tokens import decode_access_token

    secret = "x" * 40
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setenv("JWT_SECRET", secret)
    monkeypatch.setenv("COLCOOR_ENV", "development")
    get_settings.cache_clear()
    token_owner = asyncio.run(_seed_user_and_mint_jwt(postgres_url))
    token_viewer = asyncio.run(_seed_user_and_mint_jwt(postgres_url))
    settings = get_settings()
    uid_viewer = decode_access_token(token_viewer, settings)
    auth_owner = {"Authorization": f"Bearer {token_owner}"}
    auth_viewer = {"Authorization": f"Bearer {token_viewer}"}

    t_old = datetime.now(tz=UTC) - timedelta(days=10)
    t_new = datetime.now(tz=UTC) - timedelta(days=1)
    uid_dup_old = asyncio.run(
        _insert_user_row(
            postgres_url,
            cursor_sub=f"dup-old-{uuid.uuid4()}",
            email="dupinvite@example.com",
            display_name="Older Dup",
            handle="dup_old_handle",
            avatar_url="https://example.invalid/a.png",
            last_login_at=t_old,
        )
    )
    uid_dup_new = asyncio.run(
        _insert_user_row(
            postgres_url,
            cursor_sub=f"dup-new-{uuid.uuid4()}",
            email="dupinvite@example.com",
            display_name="Newer Dup",
            handle="dup_new_handle",
            avatar_url=None,
            last_login_at=t_new,
        )
    )

    with TestClient(create_app()) as client:
        r = client.post("/api/v1/conversations", headers=auth_owner, json={"title": "invite-search"})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        r = client.post(
            f"/api/v1/conversations/{cid}/members",
            headers=auth_owner,
            json={"user_id": str(uid_viewer), "role": "viewer"},
        )
        assert r.status_code == 200, r.text

        r = client.get(
            f"/api/v1/conversations/{cid}/member-invite-search",
            headers=auth_owner,
            params={"q": "dupinvite@example.com"},
        )
        assert r.status_code == 200, r.text
        rows = r.json()
        assert len(rows) == 2
        assert rows[0]["user_id"] == str(uid_dup_new)
        assert rows[1]["user_id"] == str(uid_dup_old)
        assert rows[0]["email"] == "dupinvite@example.com"
        assert rows[0]["handle"] == "dup_new_handle"
        assert rows[0]["display_name"] == "Newer Dup"
        assert rows[0]["avatar_url"] is None
        assert "last_login_at" in rows[0]

        r = client.get(
            f"/api/v1/conversations/{cid}/member-invite-search",
            headers=auth_owner,
            params={"q": "@dup_old_handle"},
        )
        assert r.status_code == 200, r.text
        assert len(r.json()) == 1
        assert r.json()[0]["user_id"] == str(uid_dup_old)

        r = client.get(
            f"/api/v1/conversations/{cid}/member-invite-search",
            headers=auth_owner,
            params={"q": str(uid_dup_new)},
        )
        assert r.status_code == 200, r.text
        assert len(r.json()) == 1

        r = client.post(
            f"/api/v1/conversations/{cid}/members",
            headers=auth_owner,
            json={"user_id": str(uid_dup_new), "role": "editor"},
        )
        assert r.status_code == 200, r.text

        r = client.get(
            f"/api/v1/conversations/{cid}/member-invite-search",
            headers=auth_owner,
            params={"q": "dupinvite@example.com"},
        )
        assert r.status_code == 200, r.text
        assert len(r.json()) == 1
        assert r.json()[0]["user_id"] == str(uid_dup_old)

        r = client.get(
            f"/api/v1/conversations/{cid}/member-invite-search",
            headers=auth_viewer,
            params={"q": "dupinvite@example.com"},
        )
        assert r.status_code == 403, r.text

        r = client.get(
            f"/api/v1/conversations/{cid}/member-invite-search",
            headers=auth_owner,
            params={"q": "not-a-handle!!!"},
        )
        assert r.status_code == 422, r.text

    get_settings.cache_clear()


def test_side_chat_http(monkeypatch: pytest.MonkeyPatch, postgres_url: str) -> None:
    """GET/POST/PATCH/DELETE side-chat + PATCH read (api-contracts §10.1–10.5)."""
    secret = "x" * 40
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setenv("JWT_SECRET", secret)
    monkeypatch.setenv("COLCOOR_ENV", "development")
    get_settings.cache_clear()
    token = asyncio.run(_seed_user_and_mint_jwt(postgres_url))
    auth = {"Authorization": f"Bearer {token}"}

    with TestClient(create_app()) as client:
        r = client.post("/api/v1/conversations", headers=auth, json={"title": "side"})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        r = client.get(f"/api/v1/conversations/{cid}/side-chat/messages", headers=auth)
        assert r.status_code == 200, r.text
        assert r.json()["messages"] == []

        r = client.post(
            f"/api/v1/conversations/{cid}/side-chat/messages",
            headers=auth,
            json={"kind": "user", "body": "  hello  "},
        )
        assert r.status_code == 200, r.text
        m0 = r.json()
        assert m0["body"] == "hello"
        assert m0["seq"] == 1
        assert m0["author_display_name"] is None
        assert m0["author_avatar_url"] is None
        mid = m0["id"]

        r = client.get("/api/v1/conversations", headers=auth)
        assert r.status_code == 200, r.text
        row = next(x for x in r.json() if x["id"] == cid)
        assert row["side_chat_has_unread"] is True
        assert row["side_chat_unread_count"] == 1

        r = client.get(f"/api/v1/conversations/{cid}/side-chat/messages", headers=auth)
        assert r.status_code == 200, r.text
        assert len(r.json()["messages"]) == 1

        r = client.get(
            f"/api/v1/conversations/{cid}/side-chat/messages?after_seq=1",
            headers=auth,
        )
        assert r.status_code == 200, r.text
        assert r.json()["messages"] == []

        r = client.patch(
            f"/api/v1/conversations/{cid}/side-chat/messages/{mid}",
            headers=auth,
            json={"body": "edited"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["body"] == "edited"
        assert r.json()["edited_at"] is not None

        r = client.patch(
            f"/api/v1/conversations/{cid}/side-chat/read",
            headers=auth,
            json={"last_read_seq": 1},
        )
        assert r.status_code == 204, r.text

        r = client.get("/api/v1/conversations", headers=auth)
        assert r.status_code == 200, r.text
        row2 = next(x for x in r.json() if x["id"] == cid)
        assert row2["side_chat_has_unread"] is False
        assert row2["side_chat_unread_count"] == 0

        r = client.delete(
            f"/api/v1/conversations/{cid}/side-chat/messages/{mid}",
            headers=auth,
        )
        assert r.status_code == 200, r.text
        assert r.json()["deleted_at"] is not None

        r = client.get(f"/api/v1/conversations/{cid}/side-chat/messages", headers=auth)
        assert r.status_code == 200, r.text
        tomb_msgs = r.json()["messages"]
        assert len(tomb_msgs) == 1
        tomb = tomb_msgs[0]
        assert tomb["id"] == mid
        assert tomb["deleted_at"] is not None
        assert tomb["body"] is None
        assert tomb["deletion_kind"] == "self"
        assert tomb["deleted_by_user_id"] == m0["author_user_id"]

    get_settings.cache_clear()


def test_side_chat_stream_http(monkeypatch: pytest.MonkeyPatch, postgres_url: str) -> None:
    """GET …/side-chat/stream returns SSE and at least one side_chat frame (api-contracts §10.6)."""
    secret = "x" * 40
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setenv("JWT_SECRET", secret)
    monkeypatch.setenv("COLCOOR_ENV", "development")
    monkeypatch.setenv("COLCOOR_SIDE_CHAT_SSE_POLL_SEC", "0.05")
    monkeypatch.setenv("COLCOOR_SIDE_CHAT_SSE_MAX_SECONDS", "0.2")
    get_settings.cache_clear()
    token = asyncio.run(_seed_user_and_mint_jwt(postgres_url))
    auth = {"Authorization": f"Bearer {token}"}

    with TestClient(create_app()) as client:
        r = client.post("/api/v1/conversations", headers=auth, json={"title": "sse"})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        r = client.post(
            f"/api/v1/conversations/{cid}/side-chat/messages",
            headers=auth,
            json={"kind": "user", "body": "stream-me"},
        )
        assert r.status_code == 200, r.text

        with client.stream(
            "GET",
            f"/api/v1/conversations/{cid}/side-chat/stream?after_seq=0",
            headers=auth,
        ) as resp:
            assert resp.status_code == 200, resp.text
            assert "text/event-stream" in resp.headers.get("content-type", "")
            raw = resp.read()
        text = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else str(raw)
        assert "data:" in text
        line = text.split("data: ", 1)[1].split("\n", 1)[0]
        obj = json.loads(line)
        assert obj["type"] == "side_chat"
        assert obj["message"]["body"] == "stream-me"
        assert "author_display_name" in obj["message"]
        assert "author_avatar_url" in obj["message"]

    get_settings.cache_clear()


def test_transfer_ownership_via_patch_http(monkeypatch: pytest.MonkeyPatch, postgres_url: str) -> None:
    """PATCH member to owner demotes prior owner to editor; new owner can delete conversation."""
    from colcoor_backend.core.jwt_tokens import decode_access_token

    secret = "x" * 40
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setenv("JWT_SECRET", secret)
    monkeypatch.setenv("COLCOOR_ENV", "development")
    get_settings.cache_clear()
    token_a = asyncio.run(_seed_user_and_mint_jwt(postgres_url))
    token_b = asyncio.run(_seed_user_and_mint_jwt(postgres_url))
    settings = get_settings()
    uid_b = decode_access_token(token_b, settings)
    auth_a = {"Authorization": f"Bearer {token_a}"}
    auth_b = {"Authorization": f"Bearer {token_b}"}

    with TestClient(create_app()) as client:
        r = client.post("/api/v1/conversations", headers=auth_a, json={"title": "xfer"})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        r = client.post(
            f"/api/v1/conversations/{cid}/members",
            headers=auth_a,
            json={"user_id": str(uid_b), "role": "editor"},
        )
        assert r.status_code == 200, r.text

        r = client.patch(
            f"/api/v1/conversations/{cid}/members/{uid_b}",
            headers=auth_a,
            json={"role": "owner"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "owner"

        r = client.get(f"/api/v1/conversations/{cid}/members", headers=auth_a)
        assert r.status_code == 200, r.text
        by_uid = {m["user_id"]: m["role"] for m in r.json()}
        assert by_uid[str(uid_b)] == "owner"
        uid_a = decode_access_token(token_a, settings)
        assert by_uid[str(uid_a)] == "editor"

        r = client.delete(f"/api/v1/conversations/{cid}", headers=auth_b)
        assert r.status_code == 200, r.text
        assert r.json()["deletion_group_id"]

    get_settings.cache_clear()


def test_soft_delete_conversation_undo_and_restore(monkeypatch: pytest.MonkeyPatch, postgres_url: str) -> None:
    """DELETE conversation soft-deletes graph; undo-delete and restore-deleted recover (api-contracts §3.4)."""
    secret = "x" * 40
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setenv("JWT_SECRET", secret)
    monkeypatch.setenv("COLCOOR_ENV", "development")
    get_settings.cache_clear()
    token = asyncio.run(_seed_user_and_mint_jwt(postgres_url))
    auth = {"Authorization": f"Bearer {token}"}

    with TestClient(create_app()) as client:
        r = client.post("/api/v1/conversations", headers=auth, json={"title": "delme"})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        r = client.delete(f"/api/v1/conversations/{cid}", headers=auth)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["deleted_count"] >= 1
        gid = body["deletion_group_id"]
        assert gid

        r = client.get("/api/v1/conversations", headers=auth)
        assert r.status_code == 200, r.text
        assert cid not in {row["id"] for row in r.json()}

        r = client.post(
            f"/api/v1/conversations/{cid}/events/undo-delete",
            headers=auth,
            json={"deletion_group_id": gid},
        )
        assert r.status_code == 200, r.text
        assert r.json()["restored_count"] >= 1

        r = client.get("/api/v1/conversations", headers=auth)
        assert r.status_code == 200, r.text
        assert cid in {row["id"] for row in r.json()}

        r = client.delete(f"/api/v1/conversations/{cid}", headers=auth)
        assert r.status_code == 200, r.text
        gid2 = r.json()["deletion_group_id"]
        assert gid2

        r = client.post(f"/api/v1/conversations/{cid}/restore-deleted", headers=auth)
        assert r.status_code == 200, r.text
        assert r.json()["restored_count"] >= 1

        r = client.get("/api/v1/conversations", headers=auth)
        assert cid in {row["id"] for row in r.json()}

        r = client.delete(f"/api/v1/conversations/{cid}", headers=auth)
        assert r.status_code == 200, r.text
        r = client.delete(f"/api/v1/conversations/{cid}", headers=auth)
        assert r.status_code == 200, r.text
        assert r.json()["deleted_count"] == 0
        assert r.json()["deletion_group_id"] is None

    get_settings.cache_clear()


def test_append_graph_event_inherits_deleted_at_from_deleted_parent(session_factory) -> None:
    """Replies anchored under a soft-deleted row inherit ``deleted_at`` (hidden like the rest of the subtree)."""

    async def run() -> None:
        async with session_factory() as s:
            u = User(
                cursor_sub=f"sub-{uuid.uuid4()}",
                email="delp@d.c",
                display_name="t",
                last_login_at=datetime.now(tz=UTC),
            )
            s.add(u)
            await s.flush()
            await s.refresh(u)
            uid = u.id
            conv, _ = await create_conversation_with_owner(s, user_id=uid, title="inherit-del")
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
                content="to delete",
                private_branch=False,
            )
            await soft_delete_event_subtree(s, conv.id, uid, u_ev.id)
            parent_row = await s.get(Event, u_ev.id)
            assert parent_row is not None and parent_row.deleted_at is not None
            child = await append_graph_event(
                s,
                conversation_id=conv.id,
                user_id=uid,
                kind="user_input",
                parent_event_id=u_ev.id,
                content="under deleted",
                private_branch=False,
            )
            assert child.deleted_at is not None
            assert child.deleted_at == parent_row.deleted_at
            assert child.deletion_group_id == parent_row.deletion_group_id
            assert child.deleted_by_user_id == parent_row.deleted_by_user_id
            tree = await list_events_for_tree(s, conv.id, uid)
            assert child.id not in {e.id for e in tree}
            await s.commit()

    asyncio.run(run())


def test_purge_hard_deletes_soft_deleted_events_after_retention(session_factory) -> None:
    """``purge_soft_deleted_events`` removes rows with ``deleted_at`` older than the retention window."""

    async def run() -> None:
        async with session_factory() as s:
            u = User(
                cursor_sub=f"sub-{uuid.uuid4()}",
                email="purge@p.c",
                display_name="t",
                last_login_at=datetime.now(tz=UTC),
            )
            s.add(u)
            await s.flush()
            await s.refresh(u)
            uid = u.id
            conv, _ = await create_conversation_with_owner(s, user_id=uid, title="purge-me")
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
                content="to purge",
                private_branch=False,
            )
            await append_graph_event(
                s,
                conversation_id=conv.id,
                user_id=uid,
                kind="assistant_output",
                parent_event_id=u_ev.id,
                content="assistant",
                private_branch=False,
            )
            await create_note_on_event(s, conv.id, uid, u_ev.id, "note on branch")
            await soft_delete_event_subtree(s, conv.id, uid, u_ev.id)
            old = datetime.now(tz=UTC) - timedelta(days=2)
            await s.execute(
                update(Event)
                .where(Event.conversation_id == conv.id, Event.deleted_at.isnot(None))
                .values(deleted_at=old, updated_at=old),
            )
            n = await purge_soft_deleted_events(s, older_than=timedelta(hours=1))
            assert n == 2
            cnt = await s.scalar(select(func.count()).select_from(Event).where(Event.conversation_id == conv.id))
            assert cnt == 1
            await s.commit()

        async with session_factory() as s:
            cnt2 = await s.scalar(select(func.count()).select_from(Event).where(Event.conversation_id == conv.id))
            assert cnt2 == 1

    asyncio.run(run())


def test_soft_delete_event_subtree_http(monkeypatch: pytest.MonkeyPatch, postgres_url: str) -> None:
    """DELETE …/events/{id} soft-deletes subtree, clears stars, hides notes; root delete is rejected."""
    secret = "x" * 40
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setenv("JWT_SECRET", secret)
    monkeypatch.setenv("COLCOOR_ENV", "development")
    get_settings.cache_clear()
    token = asyncio.run(_seed_user_and_mint_jwt(postgres_url))
    auth = {"Authorization": f"Bearer {token}"}

    with TestClient(create_app()) as client:
        r = client.post("/api/v1/conversations", headers=auth, json={"title": "subtree"})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        r = client.get(f"/api/v1/conversations/{cid}/tree", headers=auth)
        assert r.status_code == 200, r.text
        root = next(e for e in r.json()["events"] if e["parent_event_id"] is None)

        r = client.post(
            f"/api/v1/conversations/{cid}/append-event",
            headers=auth,
            json={
                "kind": "user_input",
                "parent_event_id": root["id"],
                "content": "branch head",
                "author": "end_user",
                "private_branch": False,
            },
        )
        assert r.status_code == 200, r.text
        head_id = r.json()["id"]

        r = client.post(
            f"/api/v1/conversations/{cid}/append-event",
            headers=auth,
            json={
                "kind": "assistant_output",
                "parent_event_id": head_id,
                "content": "reply",
                "author": "cursor_agent",
                "private_branch": False,
            },
        )
        assert r.status_code == 200, r.text
        asst_id = r.json()["id"]

        r = client.post(
            f"/api/v1/conversations/{cid}/append-event",
            headers=auth,
            json={
                "kind": "user_input",
                "parent_event_id": root["id"],
                "content": "sibling stays",
                "author": "end_user",
                "private_branch": False,
            },
        )
        assert r.status_code == 200, r.text
        sibling_id = r.json()["id"]

        r = client.post(
            f"/api/v1/conversations/{cid}/notes",
            headers=auth,
            json={"event_id": head_id, "content": "TODO on branch"},
        )
        assert r.status_code == 200, r.text

        r = client.put(f"/api/v1/conversations/{cid}/events/{head_id}/star", headers=auth)
        assert r.status_code == 204, r.text

        r = client.delete(f"/api/v1/conversations/{cid}/events/{head_id}", headers=auth)
        assert r.status_code == 200, r.text
        del_out = r.json()
        assert del_out["deleted_count"] == 2
        assert del_out["deletion_group_id"]

        r = client.delete(f"/api/v1/conversations/{cid}/events/{head_id}", headers=auth)
        assert r.status_code == 200, r.text
        assert r.json()["deleted_count"] == 0
        assert r.json()["deletion_group_id"] is None

        r = client.get(f"/api/v1/conversations/{cid}/tree", headers=auth)
        assert r.status_code == 200, r.text
        ids = {e["id"] for e in r.json()["events"]}
        assert head_id not in ids
        assert asst_id not in ids
        assert root["id"] in ids
        assert sibling_id in ids
        for e in r.json()["events"]:
            assert e.get("starred") is not True

        r = client.get(f"/api/v1/conversations/{cid}/notes", headers=auth)
        assert r.status_code == 200, r.text
        assert r.json() == []

        r = client.post(
            f"/api/v1/conversations/{cid}/events/undo-delete",
            headers=auth,
            json={"deletion_group_id": del_out["deletion_group_id"]},
        )
        assert r.status_code == 200, r.text
        assert r.json()["restored_count"] == 2

        r = client.get(f"/api/v1/conversations/{cid}/tree", headers=auth)
        assert r.status_code == 200, r.text
        ids_after_undo = {e["id"] for e in r.json()["events"]}
        assert head_id in ids_after_undo
        assert asst_id in ids_after_undo

        r = client.delete(f"/api/v1/conversations/{cid}/events/{head_id}", headers=auth)
        assert r.status_code == 200, r.text
        del_out2 = r.json()
        assert del_out2["deleted_count"] == 2

        r = client.post(
            f"/api/v1/conversations/{cid}/events/{head_id}/restore-subtree",
            headers=auth,
        )
        assert r.status_code == 200, r.text
        assert r.json()["restored_count"] == 2

        r = client.get(f"/api/v1/conversations/{cid}/tree", headers=auth)
        assert r.status_code == 200, r.text
        ids_after_restore = {e["id"] for e in r.json()["events"]}
        assert head_id in ids_after_restore

        r = client.delete(f"/api/v1/conversations/{cid}/events/{root['id']}", headers=auth)
        assert r.status_code == 422, r.text

    get_settings.cache_clear()


def test_patch_me_http(monkeypatch: pytest.MonkeyPatch, postgres_url: str) -> None:
    """PATCH /me updates display_name, avatar_url, and handle (api-contracts §9.1)."""
    secret = "x" * 40
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setenv("JWT_SECRET", secret)
    monkeypatch.setenv("COLCOOR_ENV", "development")
    get_settings.cache_clear()
    token = asyncio.run(_seed_user_and_mint_jwt(postgres_url))
    auth = {"Authorization": f"Bearer {token}"}

    with TestClient(create_app()) as client:
        r = client.get("/api/v1/me", headers=auth)
        assert r.status_code == 200, r.text
        assert r.json()["email"] == "i@i.c"
        assert r.json()["display_name"] == ""
        assert r.json().get("handle") in (None, "")

        r = client.patch("/api/v1/me", headers=auth, json={})
        assert r.status_code == 422, r.text

        r = client.patch("/api/v1/me", headers=auth, json={"display_name": "Pat"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["display_name"] == "Pat"
        assert body["email"] == "i@i.c"
        assert "access_token" not in body

        r = client.patch(
            "/api/v1/me",
            headers=auth,
            json={"avatar_url": "https://cdn.example/avatar.png"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["avatar_url"] == "https://cdn.example/avatar.png"

        r = client.patch("/api/v1/me", headers=auth, json={"avatar_url": None})
        assert r.status_code == 200, r.text
        assert r.json()["avatar_url"] is None

        r = client.patch("/api/v1/me", headers=auth, json={"handle": "patch_me_handle"})
        assert r.status_code == 200, r.text
        assert r.json()["handle"] == "patch_me_handle"

        r = client.get("/api/v1/me", headers=auth)
        assert r.status_code == 200, r.text
        assert r.json()["handle"] == "patch_me_handle"

        r = client.patch("/api/v1/me", headers=auth, json={"handle": None})
        assert r.status_code == 200, r.text
        assert r.json().get("handle") in (None, "")

    get_settings.cache_clear()
