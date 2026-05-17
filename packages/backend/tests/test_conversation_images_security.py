"""Production hardening tests for conversation image storage."""

from __future__ import annotations

import asyncio
import os
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import colcoor_backend.db.models  # noqa: F401
from colcoor_backend.app import create_app
from colcoor_backend.core.config import get_settings
from colcoor_backend.db.models import Conversation, ConversationImage, ConversationMember, User
from colcoor_backend.services.conversation_images import (
    delete_conversation_image,
    ensure_conversation_editor,
    get_conversation_image_row,
    load_conversation_image_bytes,
    store_conversation_image,
    validate_image_payload,
)
from colcoor_backend.storage.keys import conversation_image_object_key
from colcoor_backend.storage.local import LocalImageBlobStorage
from test_graph_integration import _seed_user_and_mint_jwt

requires_postgres = pytest.mark.skipif(
    not os.environ.get("COLCOOR_TEST_DATABASE_URL"),
    reason="requires COLCOOR_TEST_DATABASE_URL",
)


def test_validate_image_payload_rejects_bad_mime() -> None:
    with pytest.raises(ValueError, match="unsupported image mime_type"):
        validate_image_payload("application/pdf", b"x", max_bytes=1024)


def test_validate_image_payload_rejects_oversized() -> None:
    with pytest.raises(ValueError, match="exceeds max size"):
        validate_image_payload("image/png", b"x" * 20, max_bytes=10)


def test_validate_image_payload_accepts_allowed_mimes() -> None:
    for mt in ("image/png", "image/jpeg", "image/webp", "image/gif"):
        assert validate_image_payload(mt, b"\x00", max_bytes=1024) == mt


def test_object_key_uses_uuid_only() -> None:
    cid = uuid.UUID("00000000-0000-4000-8000-000000000001")
    iid = uuid.UUID("00000000-0000-4000-8000-000000000002")
    assert conversation_image_object_key(cid, iid) == (
        "conversations/00000000-0000-4000-8000-000000000001/"
        "images/00000000-0000-4000-8000-000000000002"
    )


async def _seed_conversation_with_roles(
    session: AsyncSession,
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID]:
    """Returns ``conversation_id, owner_id, editor_id, viewer_id``."""
    owner = uuid.uuid4()
    editor = uuid.uuid4()
    viewer = uuid.uuid4()
    cid = uuid.uuid4()
    for uid, handle in ((owner, "own"), (editor, "edit"), (viewer, "view")):
        session.add(
            User(
                id=uid,
                email=f"{uid}@test.local",
                display_name=handle,
                handle=f"{handle}-{uid.hex[:6]}",
                cursor_sub=f"sub-{uid}",
            )
        )
    session.add(Conversation(id=cid, title="roles"))
    session.add(ConversationMember(conversation_id=cid, user_id=owner, role="owner"))
    session.add(ConversationMember(conversation_id=cid, user_id=editor, role="editor"))
    session.add(ConversationMember(conversation_id=cid, user_id=viewer, role="viewer"))
    await session.commit()
    return cid, owner, editor, viewer


@pytest.fixture
def local_storage(tmp_path: Path) -> LocalImageBlobStorage:
    return LocalImageBlobStorage(str(tmp_path / "images"))


@requires_postgres
def test_store_cleans_up_blob_when_db_insert_fails(
    postgres_url: str, local_storage: LocalImageBlobStorage
) -> None:
    async def _run() -> None:
        eng = create_async_engine(postgres_url)
        factory = async_sessionmaker(eng, expire_on_commit=False)
        async with factory() as session:
            cid, uid = await _seed_conversation_simple(session)

        async with factory() as session:
            with patch.object(
                session,
                "flush",
                new_callable=AsyncMock,
                side_effect=RuntimeError("simulated db failure"),
            ):
                with pytest.raises(RuntimeError, match="simulated db failure"):
                    await store_conversation_image(
                        session,
                        local_storage,
                        conversation_id=cid,
                        user_id=uid,
                        mime_type="image/png",
                        data=b"\x89PNG",
                    )

        # No DB rows
        async with factory() as session:
            res = await session.execute(select(ConversationImage))
            assert res.scalars().all() == []

        files = [p for p in local_storage._root.rglob("*") if p.is_file()]
        assert files == []

        await eng.dispose()

    asyncio.run(_run())


async def _seed_conversation_simple(session: AsyncSession) -> tuple[uuid.UUID, uuid.UUID]:
    uid = uuid.uuid4()
    cid = uuid.uuid4()
    session.add(
        User(
            id=uid,
            email=f"{uid}@test.local",
            display_name="Test",
            handle=f"u{uid.hex[:8]}",
            cursor_sub=f"test-sub-{uid}",
        )
    )
    session.add(Conversation(id=cid, title="img-test"))
    session.add(ConversationMember(conversation_id=cid, user_id=uid, role="owner"))
    await session.commit()
    return cid, uid


@requires_postgres
def test_viewer_cannot_delete_image(postgres_url: str, local_storage: LocalImageBlobStorage) -> None:
    async def _run() -> None:
        eng = create_async_engine(postgres_url)
        factory = async_sessionmaker(eng, expire_on_commit=False)
        async with factory() as session:
            cid, owner, _editor, viewer = await _seed_conversation_with_roles(session)
            row = await store_conversation_image(
                session,
                local_storage,
                conversation_id=cid,
                user_id=owner,
                mime_type="image/png",
                data=b"x",
            )
            await session.commit()
            image_id = row.id

        async with factory() as session:
            with pytest.raises(PermissionError, match="viewers cannot"):
                await delete_conversation_image(
                    session,
                    local_storage,
                    conversation_id=cid,
                    user_id=viewer,
                    image_id=image_id,
                )

        async with factory() as session:
            with pytest.raises(PermissionError, match="viewers cannot"):
                await ensure_conversation_editor(session, cid, viewer)

        await eng.dispose()

    asyncio.run(_run())


@requires_postgres
def test_viewer_cannot_upload_image(postgres_url: str, local_storage: LocalImageBlobStorage) -> None:
    async def _run() -> None:
        eng = create_async_engine(postgres_url)
        factory = async_sessionmaker(eng, expire_on_commit=False)
        async with factory() as session:
            cid, owner, editor, viewer = await _seed_conversation_with_roles(session)
            with pytest.raises(PermissionError, match="viewers cannot upload"):
                await store_conversation_image(
                    session,
                    local_storage,
                    conversation_id=cid,
                    user_id=viewer,
                    mime_type="image/png",
                    data=b"x",
                )
            row = await store_conversation_image(
                session,
                local_storage,
                conversation_id=cid,
                user_id=editor,
                mime_type="image/png",
                data=b"editor-upload",
            )
            await session.commit()
            assert row.uploaded_by_user_id == editor
            owner_row = await store_conversation_image(
                session,
                local_storage,
                conversation_id=cid,
                user_id=owner,
                mime_type="image/gif",
                data=b"owner-upload",
            )
            await session.commit()
            assert owner_row.uploaded_by_user_id == owner

        await eng.dispose()

    asyncio.run(_run())


@requires_postgres
def test_viewer_can_get_image(postgres_url: str, local_storage: LocalImageBlobStorage) -> None:
    async def _run() -> None:
        eng = create_async_engine(postgres_url)
        factory = async_sessionmaker(eng, expire_on_commit=False)
        async with factory() as session:
            cid, owner, _editor, viewer = await _seed_conversation_with_roles(session)
            row = await store_conversation_image(
                session,
                local_storage,
                conversation_id=cid,
                user_id=owner,
                mime_type="image/png",
                data=b"\x89PNG",
            )
            await session.commit()
            image_id = row.id

        async with factory() as session:
            got_row = await get_conversation_image_row(
                session,
                conversation_id=cid,
                user_id=viewer,
                image_id=image_id,
            )
            assert got_row is not None
            got_bytes = await load_conversation_image_bytes(
                session,
                local_storage,
                conversation_id=cid,
                user_id=viewer,
                image_id=image_id,
            )
            assert got_bytes == (b"\x89PNG", "image/png")

        await eng.dispose()

    asyncio.run(_run())


@requires_postgres
def test_unauthorized_user_cannot_get_image_row(
    postgres_url: str, local_storage: LocalImageBlobStorage
) -> None:
    async def _run() -> None:
        eng = create_async_engine(postgres_url)
        factory = async_sessionmaker(eng, expire_on_commit=False)
        async with factory() as session:
            cid, owner = await _seed_conversation_simple(session)
            outsider = uuid.uuid4()
            session.add(
                User(
                    id=outsider,
                    email=f"{outsider}@test.local",
                    display_name="Out",
                    handle=f"o{outsider.hex[:8]}",
                    cursor_sub=f"test-sub-{outsider}",
                )
            )
            row = await store_conversation_image(
                session,
                local_storage,
                conversation_id=cid,
                user_id=owner,
                mime_type="image/png",
                data=b"x",
            )
            await session.commit()

        async with factory() as session:
            with pytest.raises(PermissionError):
                await get_conversation_image_row(
                    session,
                    conversation_id=cid,
                    user_id=outsider,
                    image_id=row.id,
                )

        await eng.dispose()

    asyncio.run(_run())


@requires_postgres
def test_delete_logs_blob_failure_but_returns_true(
    postgres_url: str, local_storage: LocalImageBlobStorage,
) -> None:
    async def _run() -> None:
        eng = create_async_engine(postgres_url)
        factory = async_sessionmaker(eng, expire_on_commit=False)
        async with factory() as session:
            cid, uid = await _seed_conversation_simple(session)
            row = await store_conversation_image(
                session,
                local_storage,
                conversation_id=cid,
                user_id=uid,
                mime_type="image/png",
                data=b"x",
            )
            await session.commit()
            image_id = row.id

        failing = LocalImageBlobStorage(str(local_storage._root))
        with patch.object(
            failing,
            "delete",
            new_callable=AsyncMock,
            side_effect=OSError("gcs unavailable"),
        ):
            async with factory() as session:
                ok = await delete_conversation_image(
                    session,
                    failing,
                    conversation_id=cid,
                    user_id=uid,
                    image_id=image_id,
                )
                assert ok is True
                await session.commit()

        async with factory() as session:
            res = await session.execute(
                select(ConversationImage).where(ConversationImage.id == image_id)
            )
            assert res.scalar_one_or_none() is None

        await eng.dispose()

    asyncio.run(_run())


@requires_postgres
def test_http_rejects_bad_mime_and_oversized(
    monkeypatch: pytest.MonkeyPatch, postgres_url: str, tmp_path: Path
) -> None:
    secret = "x" * 40
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setenv("JWT_SECRET", secret)
    monkeypatch.setenv("COLCOOR_ENV", "development")
    monkeypatch.setenv("COLCOOR_MAX_IMAGE_BYTES", "100")
    monkeypatch.delenv("GCS_BUCKET", raising=False)
    get_settings.cache_clear()
    token = asyncio.run(_seed_user_and_mint_jwt(postgres_url))
    auth = {"Authorization": f"Bearer {token}"}
    storage = LocalImageBlobStorage(str(tmp_path / "imgs"))

    with TestClient(create_app()) as client:
        client.app.state.image_blob_storage = storage
        r = client.post("/api/v1/conversations", headers=auth, json={"title": "pics"})
        cid = r.json()["id"]

        r = client.post(
            f"/api/v1/conversations/{cid}/images",
            headers=auth,
            files={"file": ("x.pdf", b"%PDF", "application/pdf")},
        )
        assert r.status_code == 422

        r = client.post(
            f"/api/v1/conversations/{cid}/images",
            headers=auth,
            files={"file": ("big.png", b"x" * 200, "image/png")},
        )
        assert r.status_code == 422

    get_settings.cache_clear()


@requires_postgres
def test_http_viewer_cannot_post_owner_can_post(
    monkeypatch: pytest.MonkeyPatch, postgres_url: str, tmp_path: Path
) -> None:
    from colcoor_backend.core.jwt_tokens import create_access_token

    secret = "x" * 40
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setenv("JWT_SECRET", secret)
    monkeypatch.setenv("COLCOOR_ENV", "development")
    monkeypatch.delenv("GCS_BUCKET", raising=False)
    get_settings.cache_clear()

    async def _setup() -> tuple[str, str, str, str]:
        eng = create_async_engine(postgres_url)
        factory = async_sessionmaker(eng, expire_on_commit=False)
        owner_id = uuid.uuid4()
        editor_id = uuid.uuid4()
        viewer_id = uuid.uuid4()
        cid = uuid.uuid4()
        async with factory() as session:
            for uid in (owner_id, editor_id, viewer_id):
                session.add(
                    User(
                        id=uid,
                        email=f"{uid}@t.local",
                        display_name="u",
                        handle=f"h{uid.hex[:6]}",
                        cursor_sub=f"s{uid}",
                    )
                )
            session.add(Conversation(id=cid, title="r"))
            session.add(
                ConversationMember(conversation_id=cid, user_id=owner_id, role="owner")
            )
            session.add(
                ConversationMember(conversation_id=cid, user_id=editor_id, role="editor")
            )
            session.add(
                ConversationMember(conversation_id=cid, user_id=viewer_id, role="viewer")
            )
            await session.commit()
        await eng.dispose()
        settings = get_settings()
        return (
            str(cid),
            create_access_token(owner_id, settings),
            create_access_token(editor_id, settings),
            create_access_token(viewer_id, settings),
        )

    cid, owner_tok, editor_tok, viewer_tok = asyncio.run(_setup())
    get_settings.cache_clear()
    storage = LocalImageBlobStorage(str(tmp_path / "imgs"))
    png = b"\x89PNG"

    with TestClient(create_app()) as client:
        client.app.state.image_blob_storage = storage

        r = client.post(
            f"/api/v1/conversations/{cid}/images",
            headers={"Authorization": f"Bearer {viewer_tok}"},
            files={"file": ("x.png", png, "image/png")},
        )
        assert r.status_code == 403

        r = client.post(
            f"/api/v1/conversations/{cid}/images",
            headers={"Authorization": f"Bearer {editor_tok}"},
            files={"file": ("x.png", png, "image/png")},
        )
        assert r.status_code == 200, r.text
        editor_image_id = r.json()["id"]

        r = client.post(
            f"/api/v1/conversations/{cid}/images",
            headers={"Authorization": f"Bearer {owner_tok}"},
            files={"file": ("x.png", png, "image/png")},
        )
        assert r.status_code == 200, r.text

        r = client.get(
            f"/api/v1/conversations/{cid}/images/{editor_image_id}",
            headers={"Authorization": f"Bearer {viewer_tok}"},
        )
        assert r.status_code == 200
        assert r.content == png

    get_settings.cache_clear()


@requires_postgres
def test_http_viewer_delete_forbidden(
    monkeypatch: pytest.MonkeyPatch, postgres_url: str, tmp_path: Path
) -> None:
    from colcoor_backend.core.jwt_tokens import create_access_token

    secret = "x" * 40
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setenv("JWT_SECRET", secret)
    monkeypatch.setenv("COLCOOR_ENV", "development")
    monkeypatch.delenv("GCS_BUCKET", raising=False)
    get_settings.cache_clear()

    async def _setup() -> tuple[str, str, str]:
        eng = create_async_engine(postgres_url)
        factory = async_sessionmaker(eng, expire_on_commit=False)
        owner_id = uuid.uuid4()
        viewer_id = uuid.uuid4()
        cid = uuid.uuid4()
        async with factory() as session:
            for uid in (owner_id, viewer_id):
                session.add(
                    User(
                        id=uid,
                        email=f"{uid}@t.local",
                        display_name="u",
                        handle=f"h{uid.hex[:6]}",
                        cursor_sub=f"s{uid}",
                    )
                )
            session.add(Conversation(id=cid, title="r"))
            session.add(
                ConversationMember(conversation_id=cid, user_id=owner_id, role="owner")
            )
            session.add(
                ConversationMember(conversation_id=cid, user_id=viewer_id, role="viewer")
            )
            await session.commit()
        await eng.dispose()
        settings = get_settings()
        return (
            str(cid),
            create_access_token(owner_id, settings),
            create_access_token(viewer_id, settings),
        )

    cid, owner_tok, viewer_tok = asyncio.run(_setup())
    get_settings.cache_clear()
    storage = LocalImageBlobStorage(str(tmp_path / "imgs"))

    with TestClient(create_app()) as client:
        client.app.state.image_blob_storage = storage
        r = client.post(
            f"/api/v1/conversations/{cid}/images",
            headers={"Authorization": f"Bearer {owner_tok}"},
            files={"file": ("x.png", b"\x89PNG", "image/png")},
        )
        assert r.status_code == 200, r.text
        image_id = r.json()["id"]

        r = client.delete(
            f"/api/v1/conversations/{cid}/images/{image_id}",
            headers={"Authorization": f"Bearer {viewer_tok}"},
        )
        assert r.status_code == 403

    get_settings.cache_clear()
