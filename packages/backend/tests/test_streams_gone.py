from uuid import uuid4

from fastapi.testclient import TestClient

from colcoor_backend.app import create_app


def test_message_stream_returns_410() -> None:
    client = TestClient(create_app())
    cid = uuid4()
    response = client.post(f"/api/v1/conversations/{cid}/message/stream")
    assert response.status_code == 410
