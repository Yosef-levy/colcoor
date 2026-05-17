"""Conversation images: metadata in Postgres, bytes in blob storage (GCS or local)."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from colcoor_backend.core.config import Settings, get_settings
from colcoor_backend.db.models import ConversationImage
from colcoor_backend.services.graph import (
    ensure_conversation_member,
    get_conversation_member,
    require_live_conversation,
)
from colcoor_backend.storage.keys import conversation_image_object_key
from colcoor_backend.storage.protocol import ImageBlobStorage

logger = logging.getLogger(__name__)

COLOOR_USER_MEDIA_KEY = "colcoor_user_media"
USER_MEDIA_VERSION = 1
ALLOWED_IMAGE_MIME = frozenset({"image/png", "image/jpeg", "image/webp", "image/gif"})
MAX_IMAGES_PER_MESSAGE = 8


def has_colcoor_user_media(content_json: dict[str, Any] | None) -> bool:
    if not content_json or COLOOR_USER_MEDIA_KEY not in content_json:
        return False
    wrap = content_json.get(COLOOR_USER_MEDIA_KEY)
    if not isinstance(wrap, dict):
        return False
    imgs = wrap.get("images")
    return isinstance(imgs, list) and len(imgs) > 0


def validate_image_payload(
    mime_type: str,
    data: bytes,
    *,
    max_bytes: int | None = None,
) -> str:
    """Return normalized mime type or raise ``ValueError``."""
    limit = max_bytes if max_bytes is not None else get_settings().max_image_bytes
    mt = mime_type.strip().lower()
    if mt not in ALLOWED_IMAGE_MIME:
        raise ValueError(f"unsupported image mime_type: {mime_type!r}")
    if len(data) == 0:
        raise ValueError("empty image body")
    if len(data) > limit:
        raise ValueError(f"image exceeds max size ({limit} bytes)")
    return mt


async def ensure_conversation_editor(
    session: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    """Owner or editor only (viewers may GET images but not upload or delete)."""
    member = await get_conversation_member(session, conversation_id, user_id)
    if member is None:
        raise PermissionError("not a member of this conversation")
    if member.role == "viewer":
        raise PermissionError("viewers cannot upload or delete conversation images")


def _assert_object_key_matches_row(row: ConversationImage) -> None:
    expected = conversation_image_object_key(row.conversation_id, row.id)
    if row.object_key != expected:
        raise RuntimeError(
            f"conversation_images.object_key mismatch id={row.id} stored={row.object_key!r}"
        )


async def store_conversation_image(
    session: AsyncSession,
    storage: ImageBlobStorage,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    mime_type: str,
    data: bytes,
    settings: Settings | None = None,
) -> ConversationImage:
    """Upload blob first; insert metadata. Rolls back blob if DB insert fails."""
    cfg = settings or get_settings()
    await ensure_conversation_editor(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    mt = validate_image_payload(mime_type, data, max_bytes=cfg.max_image_bytes)
    image_id = uuid.uuid4()
    object_key = conversation_image_object_key(conversation_id, image_id)
    now = datetime.now(tz=UTC)

    await storage.upload(object_key, data, mime_type=mt)
    try:
        row = ConversationImage(
            id=image_id,
            conversation_id=conversation_id,
            uploaded_by_user_id=user_id,
            mime_type=mt,
            byte_size=len(data),
            object_key=object_key,
            created_at=now,
        )
        session.add(row)
        await session.flush()
        await session.refresh(row)
        _assert_object_key_matches_row(row)
        return row
    except Exception:
        logger.exception(
            "conversation image DB insert failed after upload; deleting blob object_key=%s",
            object_key,
        )
        try:
            await storage.delete(object_key)
        except Exception:
            logger.exception(
                "conversation image orphan blob cleanup failed object_key=%s", object_key
            )
        raise


async def get_conversation_image_row(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    image_id: uuid.UUID,
) -> ConversationImage | None:
    """Membership-checked metadata load (required before signed redirect or download)."""
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    res = await session.execute(
        select(ConversationImage).where(
            ConversationImage.id == image_id,
            ConversationImage.conversation_id == conversation_id,
        )
    )
    row = res.scalar_one_or_none()
    if row is not None:
        _assert_object_key_matches_row(row)
    return row


async def load_conversation_image_bytes(
    session: AsyncSession,
    storage: ImageBlobStorage,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    image_id: uuid.UUID,
) -> tuple[bytes, str] | None:
    """Download bytes from blob storage after membership check."""
    row = await get_conversation_image_row(
        session,
        conversation_id=conversation_id,
        user_id=user_id,
        image_id=image_id,
    )
    if row is None:
        return None
    data = await storage.download(row.object_key)
    return data, row.mime_type


async def delete_conversation_image(
    session: AsyncSession,
    storage: ImageBlobStorage,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    image_id: uuid.UUID,
) -> bool:
    """Remove metadata then blob. Owner/editor only. Blob delete failures are logged, not raised."""
    await ensure_conversation_editor(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    res = await session.execute(
        select(ConversationImage).where(
            ConversationImage.id == image_id,
            ConversationImage.conversation_id == conversation_id,
        )
    )
    row = res.scalar_one_or_none()
    if row is None:
        return False
    _assert_object_key_matches_row(row)
    object_key = row.object_key
    await session.delete(row)
    await session.flush()
    try:
        await storage.delete(object_key)
    except Exception:
        logger.exception(
            "conversation image blob delete failed after DB row removed "
            "conversation_id=%s image_id=%s object_key=%s",
            conversation_id,
            image_id,
            object_key,
        )
    return True


async def normalize_user_media_content_json(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    content_json: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """
    Validate `colcoor_user_media` and return a normalized JSON payload for persistence.
    Ensures each image id exists in this conversation.
    """
    if content_json is None:
        return None
    if COLOOR_USER_MEDIA_KEY not in content_json:
        raise ValueError("user_input content_json may only include colcoor_user_media")
    if len(content_json) != 1:
        raise ValueError("user_input content_json must contain only colcoor_user_media")
    wrap = content_json[COLOOR_USER_MEDIA_KEY]
    if not isinstance(wrap, dict):
        raise ValueError("colcoor_user_media must be an object")
    ver = wrap.get("version")
    if ver != USER_MEDIA_VERSION:
        raise ValueError("colcoor_user_media.version must be 1")
    imgs = wrap.get("images")
    if not isinstance(imgs, list) or len(imgs) == 0:
        raise ValueError("colcoor_user_media.images must be a non-empty array")
    if len(imgs) > MAX_IMAGES_PER_MESSAGE:
        raise ValueError(f"at most {MAX_IMAGES_PER_MESSAGE} images per message")
    out_images: list[dict[str, Any]] = []
    seen: set[uuid.UUID] = set()
    for i, item in enumerate(imgs):
        if not isinstance(item, dict):
            raise ValueError(f"images[{i}] must be an object")
        raw_id = item.get("id")
        if raw_id is None:
            raise ValueError(f"images[{i}].id is required")
        try:
            iid = uuid.UUID(str(raw_id))
        except (ValueError, TypeError) as e:
            raise ValueError(f"images[{i}].id must be a UUID") from e
        if iid in seen:
            raise ValueError("duplicate image id in colcoor_user_media.images")
        seen.add(iid)
        res = await session.execute(
            select(ConversationImage).where(
                ConversationImage.id == iid,
                ConversationImage.conversation_id == conversation_id,
            )
        )
        row = res.scalar_one_or_none()
        if row is None:
            raise ValueError(f"unknown image id for this conversation: {iid}")
        out_images.append(
            {
                "id": str(row.id),
                "mime_type": row.mime_type,
                "byte_size": row.byte_size,
            }
        )
    return {COLOOR_USER_MEDIA_KEY: {"version": USER_MEDIA_VERSION, "images": out_images}}
