"""Google Cloud Storage backend for conversation images."""

from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from google.cloud import storage

logger = logging.getLogger(__name__)


class GcsImageBlobStorage:
    """Upload/download via GCS; serve reads with V4 signed URLs (stateless API workers)."""

    def __init__(self, *, bucket_name: str, signed_url_ttl_seconds: int) -> None:
        self._bucket_name = bucket_name
        self._signed_url_ttl_seconds = signed_url_ttl_seconds
        self._client = storage.Client()
        self._bucket = self._client.bucket(bucket_name)

    def _blob(self, object_key: str):
        return self._bucket.blob(object_key)

    async def upload(self, object_key: str, data: bytes, *, mime_type: str) -> None:
        blob = self._blob(object_key)

        def _upload() -> None:
            blob.upload_from_string(data, content_type=mime_type)

        await asyncio.to_thread(_upload)

    async def download(self, object_key: str) -> bytes:
        blob = self._blob(object_key)

        def _download() -> bytes:
            return blob.download_as_bytes()

        return await asyncio.to_thread(_download)

    async def delete(self, object_key: str) -> None:
        blob = self._blob(object_key)

        def _delete() -> None:
            if blob.exists():
                blob.delete()

        await asyncio.to_thread(_delete)

    def signed_download_url(self, object_key: str) -> str:
        blob = self._blob(object_key)
        return blob.generate_signed_url(
            version="v4",
            expiration=timedelta(seconds=self._signed_url_ttl_seconds),
            method="GET",
        )
