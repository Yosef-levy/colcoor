"""Filesystem blob store for local development (no signed URLs)."""

from __future__ import annotations

import asyncio
from pathlib import Path


class LocalImageBlobStorage:
    def __init__(self, root_dir: str) -> None:
        self._root = Path(root_dir).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, object_key: str) -> Path:
        # Reject path traversal
        key = object_key.replace("\\", "/").lstrip("/")
        if ".." in key.split("/"):
            raise ValueError("invalid object_key")
        return self._root / key

    async def upload(self, object_key: str, data: bytes, *, mime_type: str) -> None:
        del mime_type
        path = self._path(object_key)
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)

    async def download(self, object_key: str) -> bytes:
        path = self._path(object_key)
        if not path.is_file():
            raise FileNotFoundError(object_key)

        def _read() -> bytes:
            return path.read_bytes()

        return await asyncio.to_thread(_read)

    async def delete(self, object_key: str) -> None:
        path = self._path(object_key)

        def _unlink() -> None:
            if path.is_file():
                path.unlink()
            # prune empty parents up to root
            parent = path.parent
            while parent != self._root and parent.is_dir() and not any(parent.iterdir()):
                parent.rmdir()
                parent = parent.parent

        await asyncio.to_thread(_unlink)

    async def ping(self) -> None:
        """Verify root directory exists and is writable (readiness)."""

        def _check() -> None:
            self._root.mkdir(parents=True, exist_ok=True)
            probe = self._root / ".colcoor_ready"
            probe.write_text("ok")
            probe.unlink(missing_ok=True)

        await asyncio.to_thread(_check)

    def signed_download_url(self, object_key: str) -> str | None:
        del object_key
        return None
