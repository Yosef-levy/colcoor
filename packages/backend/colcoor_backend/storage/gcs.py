"""Google Cloud Storage backend for conversation images."""

from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from google.auth.credentials import Signing
from google.auth.transport.requests import Request as AuthRequest
from google.cloud import storage

logger = logging.getLogger(__name__)


def _signed_url_generation_kwargs(credentials) -> dict[str, str]:
    """Extra kwargs for ``generate_signed_url`` on GCE (IAM signBlob, no private key)."""
    if isinstance(credentials, Signing):
        return {}
    if not credentials.valid:
        credentials.refresh(AuthRequest())
    email = getattr(credentials, "service_account_email", None)
    token = getattr(credentials, "token", None)
    if email and token:
        return {"service_account_email": email, "access_token": token}
    raise RuntimeError(
        "cannot generate GCS signed URL: credentials have no signing key or service account email"
    )


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

    async def ping(self) -> None:
        """Verify GCS access (readiness).

        Uses object list, not ``bucket.exists()``, because ``roles/storage.objectAdmin``
        includes object APIs but not ``storage.buckets.get``.
        """

        def _check() -> None:
            next(
                iter(self._client.list_blobs(self._bucket_name, max_results=1)),
                None,
            )

        await asyncio.to_thread(_check)

    def signed_download_url(self, object_key: str) -> str:
        blob = self._blob(object_key)
        creds = self._client._credentials
        return blob.generate_signed_url(
            version="v4",
            expiration=timedelta(seconds=self._signed_url_ttl_seconds),
            method="GET",
            **_signed_url_generation_kwargs(creds),
        )
