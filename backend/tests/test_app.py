from typing import cast
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, Engine
from sqlalchemy.exc import OperationalError

from app.config import Settings
from app.main import create_app


def test_health_and_api_docs_work_without_database(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
        assert client.get("/docs").status_code == 200
        paths = client.get("/openapi.json").json()["paths"]
        assert {"/health", "/ready", "/patients", "/patients/{patient_id}"} <= paths.keys()


def test_readiness_reports_missing_configuration(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        response = client.get("/ready")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_not_configured"


def test_cors_only_allows_configured_origin(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        allowed = client.get("/health", headers={"Origin": "http://localhost:5173"})
        denied = client.get("/health", headers={"Origin": "https://unknown.test"})
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-origin" not in denied.headers


def test_unexpected_errors_keep_cors_with_framework_error_handling(settings: Settings) -> None:
    app = create_app(settings)
    api = cast(FastAPI, app.app)

    @api.get("/test-failure")
    def failure() -> None:
        raise RuntimeError("private-patient-value-and-password")

    # Starlette propagates the exception to the server after sending the safe response.
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/test-failure", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.json()["error"]["code"] == "internal_server_error"
    assert "private-patient-value-and-password" not in response.text


def test_database_failure_keeps_health_live_and_redacts_error(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = MagicMock(spec=Engine)
    engine.connect.side_effect = OperationalError(
        "SELECT private_value", {"password": "test-secret"}, Exception("private host information")
    )
    monkeypatch.setattr("app.main.build_engine", lambda _settings: engine)
    app = create_app(settings)
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        engine.connect.assert_not_called()
        response = client.get("/ready")
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "database_unavailable"
        assert "test-secret" not in response.text
        assert "private" not in response.text
    engine.dispose.assert_called_once()
    assert cast(FastAPI, app.app).state.engine is None


def test_connected_readiness_closes_connection_without_writes(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = MagicMock(spec=Engine)
    connection = MagicMock(spec=Connection)
    engine.connect.return_value.__enter__.return_value = connection
    connection.execute.return_value.scalar_one.return_value = 1
    monkeypatch.setattr("app.main.build_engine", lambda _settings: engine)
    with TestClient(create_app(settings)) as client:
        response = client.get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    assert str(connection.execute.call_args.args[0]) == "SELECT 1"
    connection.commit.assert_not_called()
    engine.connect.return_value.__exit__.assert_called_once()
