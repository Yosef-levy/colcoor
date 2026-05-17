"""Conversation image upload/retrieve/delete with local blob storage."""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import colcoor_backend.db.models  # noqa: F401
from colcoor_backend.db.models import Conversation, ConversationImage, ConversationMember, User
from colcoor_backend.services.conversation_images import (
    delete_conversation_image,
    get_conversation_image_row,
    load_conversation_image_bytes,
    store_conversation_image,
)
from colcoor_backend.storage.local import LocalImageBlobStorage


async def _seed_conversation(session: AsyncSession) -> tuple[uuid.UUID, uuid.UUID]:
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
    session.add(
        ConversationMember(
            conversation_id=cid,
            user_id=uid,
            role="owner",
        )
    )
    await session.commit()
    return cid, uid


@pytest.fixture
def local_storage(tmp_path: Path) -> LocalImageBlobStorage:
    return LocalImageBlobStorage(str(tmp_path / "images"))


def test_local_storage_roundtrip(local_storage: LocalImageBlobStorage) -> None:
    async def _run() -> None:
        key = "conversations/x/images/y"
        await local_storage.upload(key, b"\x89PNG", mime_type="image/png")
        assert await local_storage.download(key) == b"\x89PNG"
        assert local_storage.signed_download_url(key) is None
        await local_storage.delete(key)
        with pytest.raises(FileNotFoundError):
            await local_storage.download(key)

    asyncio.run(_run())


def test_store_load_delete_image(postgres_url: str, local_storage: LocalImageBlobStorage) -> None:
    async def _run() -> None:
        eng = create_async_engine(postgres_url)
        factory = async_sessionmaker(eng, expire_on_commit=False)
        async with factory() as session:
            cid, uid = await _seed_conversation(session)
            png = b"\x89PNG\r\n\x1a\n"
            row = await store_conversation_image(
                session,
                local_storage,
                conversation_id=cid,
                user_id=uid,
                mime_type="image/png",
                data=png,
            )
            await session.commit()
            image_id = row.id

        async with factory() as session:
            got = await load_conversation_image_bytes(
                session,
                local_storage,
                conversation_id=cid,
                user_id=uid,
                image_id=image_id,
            )
            assert got == (png, "image/png")

        async with factory() as session:
            ok = await delete_conversation_image(
                session,
                local_storage,
                conversation_id=cid,
                user_id=uid,
                image_id=image_id,
            )
            assert ok is True
            await session.commit()

        with pytest.raises(FileNotFoundError):
            await local_storage.download(row.object_key)

        async with factory() as session:
            res = await session.execute(select(ConversationImage).where(ConversationImage.id == image_id))
            assert res.scalar_one_or_none() is None

        await eng.dispose()

    asyncio.run(_run())


def test_get_conversation_image_row_forbidden(postgres_url: str, local_storage: LocalImageBlobStorage) -> None:
    async def _run() -> None:
        eng = create_async_engine(postgres_url)
        factory = async_sessionmaker(eng, expire_on_commit=False)
        async with factory() as session:
            cid, uid = await _seed_conversation(session)
            other = uuid.uuid4()
            session.add(
                User(
                    id=other,
                    email=f"{other}@test.local",
                    display_name="Other",
                    handle=f"o{other.hex[:8]}",
                    cursor_sub=f"test-sub-{other}",
                )
            )
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

        async with factory() as session:
            with pytest.raises(PermissionError):
                await get_conversation_image_row(
                    session,
                    conversation_id=cid,
                    user_id=other,
                    image_id=image_id,
                )

        await eng.dispose()

    asyncio.run(_run())
