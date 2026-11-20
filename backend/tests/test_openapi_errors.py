"""Declared failure statuses use the same envelope as runtime error handlers."""

import json

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

COMMON = {401, 422, 500, 503}
PATIENT_RESOURCE = COMMON | {404}


@pytest.mark.parametrize(
    ("method", "path", "expected"),
    [
        ("get", "/health", {500}),
        ("get", "/ready", {500, 503}),
        ("get", "/users", COMMON),
        ("get", "/dashboard/overview", COMMON),
        ("get", "/notifications/summary", COMMON),
        ("get", "/patients", COMMON),
        ("post", "/patients", COMMON | {409}),
        ("get", "/patients/{patient_id}", PATIENT_RESOURCE),
        ("put", "/patients/{patient_id}", PATIENT_RESOURCE | {409}),
        ("delete", "/patients/{patient_id}", PATIENT_RESOURCE | {409}),
        ("get", "/patients/{patient_id}/summary", PATIENT_RESOURCE),
        ("get", "/patients/{patient_id}/notes", PATIENT_RESOURCE),
        ("post", "/patients/{patient_id}/notes", PATIENT_RESOURCE),
        ("get", "/patients/{patient_id}/notes/{note_id}", PATIENT_RESOURCE | {410}),
        ("put", "/patients/{patient_id}/notes/{note_id}", PATIENT_RESOURCE | {403, 410}),
        ("delete", "/patients/{patient_id}/notes/{note_id}", PATIENT_RESOURCE | {403}),
        (
            "post",
            "/patients/{patient_id}/notes/{note_id}/attachments",
            PATIENT_RESOURCE | {403, 410},
        ),
        (
            "delete",
            "/patients/{patient_id}/notes/{note_id}/attachments/{attachment_id}",
            PATIENT_RESOURCE | {403, 410},
        ),
        ("get", "/patients/{patient_id}/comments", PATIENT_RESOURCE),
        ("post", "/patients/{patient_id}/comments", PATIENT_RESOURCE),
        ("post", "/patients/{patient_id}/comments/read", PATIENT_RESOURCE),
        ("put", "/patients/{patient_id}/comments/{comment_id}", PATIENT_RESOURCE | {403}),
        ("delete", "/patients/{patient_id}/comments/{comment_id}", PATIENT_RESOURCE | {403}),
    ],
)
def test_operations_document_actual_error_envelope(
    settings: Settings, method: str, path: str, expected: set[int]
) -> None:
    with TestClient(create_app(settings)) as client:
        schema = client.get("/openapi.json").json()
    assert "HTTPValidationError" not in json.dumps(schema)
    assert "#/components/schemas/ValidationError" not in json.dumps(schema)
    responses = schema["paths"][path][method]["responses"]
    failures = {int(code) for code in responses if code.isdecimal() and int(code) >= 400}
    assert failures == expected
    for status in expected:
        assert responses[str(status)]["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/ErrorResponse"
        }
