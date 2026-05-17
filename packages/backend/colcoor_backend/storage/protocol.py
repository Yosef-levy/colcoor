"""Blob storage abstraction for conversation images."""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class ImageBlobStorage(Protocol):
    """Stateless object store; Postgres holds metadata and ``object_key`` only."""

    async def upload(self, object_key: str, data: bytes, *, mime_type: str) -> None: ...

    async def download(self, object_key: str) -> bytes: ...

    async def delete(self, object_key: str) -> None: ...

    def signed_download_url(self, object_key: str) -> str | None:
        """Short-lived HTTPS URL for direct client fetch, or ``None`` to proxy bytes via API."""
