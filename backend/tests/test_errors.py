"""Exercise the HTTP error boundary without a database or application schema."""

import logging
from collections.abc import Iterator

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field, field_validator

from app.errors import AppError, register_exception_handlers


class InputPayload(BaseModel):
    age: int = Field(ge=0)
    secret: str

    @field_validator("secret")
    @classmethod
    def reject_secret(cls, value: str) -> str:
        raise ValueError(f"Rejected sensitive value: {value}")


@pytest.fixture
def client() -> Iterator[TestClient]:
    app = FastAPI()
    register_exception_handlers(app)

    @app.post("/validate")
    def validate(_payload: InputPayload) -> dict[str, bool]:
        return {"accepted": True}

    @app.get("/unavailable")
    def unavailable() -> None:
        raise AppError(
            status_code=503,
            code="database_unavailable",
            message="The database is unavailable.",
        )

    @app.get("/framework-error")
    def framework_error() -> None:
        raise HTTPException(
            status_code=401,
            detail="private authentication value",
            headers={"WWW-Authenticate": "Bearer"},
        )

    @app.get("/unexpected")
    def unexpected() -> None:
        raise RuntimeError("SQL parameters: private patient value")

    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


def test_validation_omits_input_and_validator_context(client: TestClient) -> None:
    response = client.post("/validate", json={"age": -1, "secret": "patient-secret-123"})

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert {tuple(field["path"]) for field in error["fields"]} == {
        ("body", "age"),
        ("body", "secret"),
    }
    assert all(set(field) == {"path", "code", "message"} for field in error["fields"])
    assert "patient-secret-123" not in response.text
    assert "Rejected sensitive value" not in response.text


def test_framework_errors_share_envelope_and_preserve_headers(
    client: TestClient,
) -> None:
    missing = client.get("/missing")
    assert missing.status_code == 404
    assert missing.json() == {"error": {"code": "not_found", "message": "Not Found", "fields": []}}

    wrong_method = client.get("/validate")
    assert wrong_method.status_code == 405
    assert wrong_method.headers["allow"] == "POST"
    assert wrong_method.json()["error"]["code"] == "method_not_allowed"

    denied = client.get("/framework-error")
    assert denied.status_code == 401
    assert denied.headers["www-authenticate"] == "Bearer"
    assert "private authentication value" not in denied.text


def test_expected_application_error_uses_public_details(client: TestClient) -> None:
    response = client.get("/unavailable")

    assert response.status_code == 503
    assert response.json() == {
        "error": {
            "code": "database_unavailable",
            "message": "The database is unavailable.",
            "fields": [],
        }
    }


def test_unexpected_error_hides_details_from_response_and_logs(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.ERROR, logger="app.errors"):
        response = client.get("/unexpected")

    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "internal_server_error",
            "message": "An unexpected error occurred.",
            "fields": [],
        }
    }
    assert "private patient value" not in response.text
    assert "private patient value" not in caplog.text
    assert "SQL parameters" not in caplog.text
