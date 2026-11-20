"""Actual 422 envelopes give actionable fixed messages without reflecting submitted values."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import get_session
from app.dependencies import get_current_user, get_optional_user
from app.main import create_app
from app.models import User
from app.schemas.patients import PatientCreate
from app.utils import dates


@pytest.fixture
def validation_client(settings: Settings) -> Iterator[TestClient]:
    application = create_app(settings)
    api = cast(FastAPI, application.app)
    actor = User(id=uuid4(), display_name="Validation probe", is_active=True)

    def empty_session() -> Iterator[Session]:
        # Invalid requests must be rejected before any service can execute SQL.
        with Session() as session:
            yield session

    api.dependency_overrides[get_session] = empty_session
    api.dependency_overrides[get_optional_user] = lambda: actor
    api.dependency_overrides[get_current_user] = lambda: actor
    with TestClient(application) as client:
        yield client


@pytest.mark.parametrize("method", ["POST", "PUT"])
@pytest.mark.parametrize(
    ("changes", "field", "message"),
    [
        ({"phone": "abcdefgh"}, "phone", "Enter a valid phone number."),
        ({"email": "a@b.test"}, "email", "Enter a valid email address."),
        ({"email": "private-sentinel-invalid-email"}, "email", "Enter a valid email address."),
        ({"date_of_birth": "future"}, "date_of_birth", "Date must not be in the future."),
        ({"last_visit": "future"}, "last_visit", "Date must not be in the future."),
        (
            {"allergy_status": "reported", "allergies": []},
            "allergies",
            "Add at least one allergy when allergy status is reported.",
        ),
        (
            {"allergy_status": "unknown", "allergies": ["private-allergy-sentinel"]},
            "allergies",
            "Clear the allergy list or choose the reported allergy status.",
        ),
        (
            {"allergy_status": "no_known", "allergies": ["private-allergy-sentinel"]},
            "allergies",
            "Clear the allergy list or choose the reported allergy status.",
        ),
    ],
)
def test_patient_validation_has_safe_actionable_field_messages(
    validation_client: TestClient, method: str, changes: dict, field: str, message: str
) -> None:
    payload = PatientCreate(
        first_name="Synthetic", last_name="Validation", date_of_birth="1980-01-01"
    ).model_dump(mode="json")
    payload.update(
        {
            key: (dates.utc_today() + timedelta(days=1)).isoformat() if value == "future" else value
            for key, value in changes.items()
        }
    )
    path = "/patients" if method == "POST" else f"/patients/{uuid4()}"
    response = validation_client.request(method, path, json=payload)
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert len(error["fields"]) == 1
    assert error["fields"][0]["path"] == ["body", field]
    assert error["fields"][0]["message"] == message
    assert set(error["fields"][0]) == {"path", "code", "message"}
    for marker in ("abcdefgh", "a@b.test", "private-sentinel", "private-allergy-sentinel"):
        assert marker not in response.text


def test_future_clinical_timestamp_has_specific_safe_message(validation_client: TestClient) -> None:
    future = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    response = validation_client.post(
        f"/patients/{uuid4()}/notes", json={"timestamp": future, "content": "private-note-sentinel"}
    )
    assert response.status_code == 422
    assert response.json()["error"]["fields"] == [
        {
            "path": ["body", "timestamp"],
            "code": "clinical_time_in_future",
            "message": "Clinical time cannot be in the future.",
        }
    ]
    assert "private-note-sentinel" not in response.text
    assert future not in response.text
