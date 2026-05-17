"""Object key layout for conversation images in blob storage."""

from __future__ import annotations

import uuid


def conversation_image_object_key(conversation_id: uuid.UUID, image_id: uuid.UUID) -> str:
    """
    Deterministic object path using server-issued UUIDs only (no user filenames).

    ``image_id`` must be ``uuid.uuid4()`` at upload time so keys are not guessable.
  """
    return f"conversations/{conversation_id}/images/{image_id}"
