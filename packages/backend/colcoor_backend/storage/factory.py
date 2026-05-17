"""Construct image blob storage from settings."""

from __future__ import annotations

import logging

from colcoor_backend.core.config import Settings
from colcoor_backend.storage.gcs import GcsImageBlobStorage
from colcoor_backend.storage.local import LocalImageBlobStorage
from colcoor_backend.storage.protocol import ImageBlobStorage

logger = logging.getLogger(__name__)


def create_image_blob_storage(settings: Settings) -> ImageBlobStorage:
    backend = settings.resolved_image_storage_backend()
    if backend == "gcs":
        bucket = settings.gcs_bucket_normalized()
        if not bucket:
            raise RuntimeError("GCS_BUCKET is required when image storage backend is gcs")
        logger.info(
            "image storage: GCS bucket=%s signed_url_ttl=%ss",
            bucket,
            settings.gcs_signed_url_ttl_seconds,
        )
        return GcsImageBlobStorage(
            bucket_name=bucket,
            signed_url_ttl_seconds=settings.gcs_signed_url_ttl_seconds,
        )
    root = settings.local_image_storage_path_normalized()
    logger.info("image storage: local filesystem root=%s", root)
    return LocalImageBlobStorage(root)
