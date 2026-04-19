"""Binary image blobs for conversation events and side chat (content_json references)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from colcoor_backend.db.models import ConversationImage
from colcoor_backend.services.graph import ensure_conversation_member, require_live_conversation

COLOOR_USER_MEDIA_KEY = "colcoor_user_media"
USER_MEDIA_VERSION = 1
ALLOWED_IMAGE_MIME = frozenset({"image/png", "image/jpeg", "image/webp", "image/gif"})
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGES_PER_MESSAGE = 8


def has_colcoor_user_media(content_json: dict[str, Any] | None) -> bool:
    if not content_json or COLOOR_USER_MEDIA_KEY not in content_json:
        return False
    wrap = content_json.get(COLOOR_USER_MEDIA_KEY)
    if not isinstance(wrap, dict):
        return False
    imgs = wrap.get("images")
    return isinstance(imgs, list) and len(imgs) > 0


async def store_conversation_image(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    mime_type: str,
    data: bytes,
) -> ConversationImage:
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    mt = mime_type.strip().lower()
    if mt not in ALLOWED_IMAGE_MIME:
        raise ValueError(f"unsupported image mime_type: {mime_type!r}")
    if len(data) == 0:
        raise ValueError("empty image body")
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError(f"image exceeds max size ({MAX_IMAGE_BYTES} bytes)")
    now = datetime.now(tz=UTC)
    row = ConversationImage(
        conversation_id=conversation_id,
        uploaded_by_user_id=user_id,
        mime_type=mt,
        byte_size=len(data),
        image_bytes=data,
        created_at=now,
    )
    session.add(row)
    await session.flush()
    await session.refresh(row)
    return row


async def load_conversation_image_bytes(
    session: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    image_id: uuid.UUID,
) -> tuple[bytes, str] | None:
    """Return (bytes, mime_type) if the row exists in this conversation and caller is a member."""
    await ensure_conversation_member(session, conversation_id, user_id)
    await require_live_conversation(session, conversation_id)
    res = await session.execute(
        select(ConversationImage).where(
            ConversationImage.id == image_id,
            ConversationImage.conversation_id == conversation_id,
        )
    )
    row = res.scalar_one_or_none()
    if row is None:
        return None
    return row.image_bytes, row.mime_type


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
