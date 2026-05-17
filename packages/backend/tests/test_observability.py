"""Metrics, request IDs, and readiness extensions."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from colcoor_backend.app import create_app


def test_metrics_endpoint() -> None:
    client = TestClient(create_app())
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "colcoor_http_requests_total" in response.text


def test_request_id_generated_and_echoed() -> None:
    client = TestClient(create_app())
    response = client.get("/health")
    assert response.status_code == 200
    assert "X-Request-ID" in response.headers
    assert len(response.headers["X-Request-ID"]) >= 8


def test_request_id_propagated() -> None:
    client = TestClient(create_app())
    rid = "test-request-id-12345"
    response = client.get("/health", headers={"X-Request-ID": rid})
    assert response.headers.get("X-Request-ID") == rid


def test_ready_includes_storage_label() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["storage"] in ("ok", "not_configured")


def test_json_log_format_in_production(monkeypatch) -> None:
    monkeypatch.setenv("COLCOOR_ENV", "production")
    from colcoor_backend.logging_config import JsonLogFormatter
    import logging

    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="hello",
        args=(),
        exc_info=None,
    )
    line = JsonLogFormatter().format(record)
    payload = json.loads(line)
    assert payload["level"] == "INFO"
    assert payload["message"] == "hello"
    assert "timestamp" in payload
