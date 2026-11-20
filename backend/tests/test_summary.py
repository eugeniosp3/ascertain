"""Fresh template summaries use clinical profile/notes, never team discussion."""

from datetime import UTC, date, datetime
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Patient, User


def test_summary_unknown_values_age_and_missing_patient(
    api_client: TestClient, db_session: Session
) -> None:
    patient = Patient(first_name="No", last_name="Notes", date_of_birth=date(1980, 12, 31))
    db_session.add(patient)
    db_session.commit()
    response = api_client.get(f"/patients/{patient.id}/summary")
    assert response.status_code == 200
    result = response.json()
    assert result["patient_id"] == str(patient.id) and result["method"] == "template"
    assert f"{patient.age_on(datetime.now(UTC).date())}-year-old" in result["summary"]
    assert "Blood type is unknown" in result["summary"]
    assert "Allergy status is unknown" in result["summary"]
    assert "no clinical notes" in result["summary"]
    assert api_client.get(f"/patients/{uuid4()}/summary").status_code == 404


def test_summary_is_fresh_and_excludes_comments_and_deleted_notes(
    api_client: TestClient, db_session: Session, demo_users: tuple[User, User]
) -> None:
    patient = Patient(
        first_name="Clinical",
        last_name="Summary",
        date_of_birth=date(1980, 1, 1),
        blood_type="A+",
        conditions=[{"code": "I10", "label": "Hypertension"}],
        allergy_status="reported",
        allergies=["Penicillin"],
    )
    db_session.add(patient)
    db_session.commit()
    headers = {"X-Demo-User-ID": str(demo_users[0].id)}
    root = f"/patients/{patient.id}"
    note = api_client.post(
        f"{root}/notes",
        headers=headers,
        json={
            "timestamp": "2026-01-01T00:00:00Z",
            "title": "Follow-up",
            "content": "Blood pressure improved.",
        },
    )
    assert note.status_code == 201
    assert (
        api_client.post(
            f"{root}/comments", headers=headers, json={"body": "SECRET DISCUSSION ONLY"}
        ).status_code
        == 201
    )
    summary = api_client.get(f"{root}/summary").json()["summary"]
    assert all(
        text in summary for text in ("A+", "Hypertension", "Penicillin", "Blood pressure improved.")
    )
    assert "SECRET DISCUSSION ONLY" not in summary
    assert (
        api_client.put(
            note.headers["Location"],
            headers=headers,
            json={
                "timestamp": "2026-01-01T00:00:00Z",
                "title": "Revised",
                "content": "Updated clinical finding.",
            },
        ).status_code
        == 200
    )
    patient.conditions = [{"code": None, "label": "Updated condition"}]
    patient.allergies = []
    patient.allergy_status = "no_known"
    db_session.commit()
    updated = api_client.get(f"{root}/summary").json()["summary"]
    assert "Updated condition" in updated and "Updated clinical finding." in updated
    assert "No known allergies" in updated
    assert "Hypertension" not in updated and "Penicillin" not in updated
    assert "Blood pressure improved." not in updated
    assert api_client.delete(note.headers["Location"], headers=headers).status_code == 204
    deleted = api_client.get(f"{root}/summary").json()["summary"]
    assert "Updated clinical finding." not in deleted and "Revised" not in deleted
    assert "no clinical notes" in deleted
