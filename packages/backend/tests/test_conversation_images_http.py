"""HTTP routes for conversation images (local blob storage)."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from colcoor_backend.app import create_app
from colcoor_backend.core.config import get_settings
from colcoor_backend.storage.local import LocalImageBlobStorage
from test_graph_integration import _seed_user_and_mint_jwt


def test_conversation_images_http_roundtrip(
    monkeypatch: pytest.MonkeyPatch, postgres_url: str, tmp_path: Path
) -> None:
    secret = "x" * 40
    monkeypatch.setenv("DATABASE_URL", postgres_url)
    monkeypatch.setenv("JWT_SECRET", secret)
    monkeypatch.setenv("COLCOOR_ENV", "development")
    monkeypatch.delenv("GCS_BUCKET", raising=False)
    get_settings.cache_clear()
    token = asyncio.run(_seed_user_and_mint_jwt(postgres_url))
    auth = {"Authorization": f"Bearer {token}"}
    storage = LocalImageBlobStorage(str(tmp_path / "imgs"))

    with TestClient(create_app()) as client:
        client.app.state.image_blob_storage = storage
        r = client.post("/api/v1/conversations", headers=auth, json={"title": "pics"})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        png = b"\x89PNG\r\n\x1a\n\x00"
        r = client.post(
            f"/api/v1/conversations/{cid}/images",
            headers=auth,
            files={"file": ("x.png", png, "image/png")},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        image_id = body["id"]
        assert body["byte_size"] == len(png)

        r = client.get(f"/api/v1/conversations/{cid}/images/{image_id}", headers=auth)
        assert r.status_code == 200, r.text
        assert r.content == png
        assert r.headers["content-type"].startswith("image/png")

        r = client.delete(f"/api/v1/conversations/{cid}/images/{image_id}", headers=auth)
        assert r.status_code == 204, r.text

        r = client.get(f"/api/v1/conversations/{cid}/images/{image_id}", headers=auth)
        assert r.status_code == 404

    get_settings.cache_clear()
