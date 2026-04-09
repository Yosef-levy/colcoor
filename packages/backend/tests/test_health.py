from fastapi.testclient import TestClient

from colcoor_backend.app import create_app


def test_health() -> None:
    client = TestClient(create_app())
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
