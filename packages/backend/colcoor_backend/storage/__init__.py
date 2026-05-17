"""Conversation image blob storage (GCS or local filesystem)."""

from colcoor_backend.storage.factory import create_image_blob_storage
from colcoor_backend.storage.keys import conversation_image_object_key
from colcoor_backend.storage.protocol import ImageBlobStorage

__all__ = [
    "ImageBlobStorage",
    "conversation_image_object_key",
    "create_image_blob_storage",
]
