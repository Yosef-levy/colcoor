"""GCS signed URL generation on compute metadata credentials."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import MagicMock, patch

from google.auth.credentials import Signing

from colcoor_backend.storage.gcs import GcsImageBlobStorage, _signed_url_generation_kwargs


def test_signed_url_kwargs_for_signing_credentials() -> None:
    creds = MagicMock(spec=Signing)
    assert _signed_url_generation_kwargs(creds) == {}


def test_signed_url_kwargs_for_token_only_credentials() -> None:
    creds = MagicMock()
    creds.valid = False
    creds.service_account_email = "api@project.iam.gserviceaccount.com"
    creds.token = "ya29.test"
    with patch("colcoor_backend.storage.gcs.AuthRequest"):
        creds.refresh = MagicMock()
        assert _signed_url_generation_kwargs(creds) == {
            "service_account_email": "api@project.iam.gserviceaccount.com",
            "access_token": "ya29.test",
        }
        creds.refresh.assert_called_once()


def test_gcs_ping_lists_objects_not_bucket_metadata() -> None:
    with patch("colcoor_backend.storage.gcs.storage.Client") as client_cls:
        client = MagicMock()
        client_cls.return_value = client
        client.list_blobs.return_value = iter(())
        storage = GcsImageBlobStorage(bucket_name="my-bucket", signed_url_ttl_seconds=300)

    import asyncio

    asyncio.run(storage.ping())
    client.list_blobs.assert_called_once_with("my-bucket", max_results=1)
    storage._bucket.exists.assert_not_called()


def test_signed_download_url_passes_signblob_kwargs() -> None:
    with patch("colcoor_backend.storage.gcs.storage.Client") as client_cls:
        client_cls.return_value = MagicMock()
        storage = GcsImageBlobStorage(bucket_name="b", signed_url_ttl_seconds=300)
    creds = MagicMock()
    creds.valid = True
    creds.service_account_email = "api@project.iam.gserviceaccount.com"
    creds.token = "ya29.test"
    storage._client._credentials = creds
    blob = MagicMock()
    storage._blob = MagicMock(return_value=blob)  # type: ignore[method-assign]
    storage.signed_download_url("conversations/x/images/y")
    blob.generate_signed_url.assert_called_once_with(
        version="v4",
        expiration=timedelta(seconds=300),
        method="GET",
        service_account_email="api@project.iam.gserviceaccount.com",
        access_token="ya29.test",
    )
