from fastapi.testclient import TestClient

from colcoor_backend.app import create_app


def test_ready_without_database_in_development() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["database"] == "not_configured"
    assert body["redis"] == "not_configured"
    assert body["storage"] in ("ok", "not_configured")
