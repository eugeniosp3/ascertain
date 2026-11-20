"""Whole-dataset dashboard totals and previews against PostgreSQL."""

from datetime import UTC, date, datetime
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Comment, Note, Patient, User
from app.utils import dates


def test_empty_overview_does_not_invent_patients(api_client: TestClient) -> None:
    response = api_client.get("/dashboard/overview")
    assert response.status_code == 200
    assert response.json() == {
        "scope": "global",
        "assigned_user": None,
        "totals": {"patients": 0, "active": 0, "inactive": 0, "clinical_notes": 0, "no_visit": 0},
        "recent_visits": [],
        "no_visit_patients": [],
    }


def test_overview_counts_full_dataset_and_limits_each_sorted_preview(
    api_client: TestClient,
    db_session: Session,
    demo_users: tuple[User, User],
) -> None:
    patients = [
        Patient(
            id=UUID(int=index + 1),
            first_name="Demo",
            last_name=f"Family{15 - index:02}",
            date_of_birth=date(1980, 1, 1),
            status="active" if index % 2 == 0 else "inactive",
            last_visit=date(2020, 1, index + 1) if index < 8 else None,
        )
        for index in range(16)
    ]
    db_session.add_all(patients)
    db_session.flush()
    for patient in patients:
        db_session.add(
            Note(
                patient_id=patient.id,
                author_id=demo_users[0].id,
                timestamp=datetime(2020, 1, 1, tzinfo=UTC),
                title="Visit",
                content="Fictional clinical note",
            )
        )
    db_session.add_all(
        [
            Note(
                patient_id=patients[0].id,
                author_id=demo_users[0].id,
                timestamp=datetime(2020, 1, 1, tzinfo=UTC),
                title=None,
                content=None,
                deleted_at=datetime(2020, 1, 2, tzinfo=UTC),
                deleted_by_id=demo_users[0].id,
            ),
            Comment(
                patient_id=patients[0].id, author_id=demo_users[1].id, body="Discussion, not a note"
            ),
        ]
    )
    db_session.flush()
    response = api_client.get("/dashboard/overview")
    assert response.status_code == 200
    overview = response.json()
    assert overview["totals"] == {
        "patients": 16,
        "active": 8,
        "inactive": 8,
        "clinical_notes": 16,
        "no_visit": 8,
    }
    assert [item["id"] for item in overview["recent_visits"]] == [
        str(patient.id) for patient in reversed(patients[2:8])
    ]
    assert [item["id"] for item in overview["no_visit_patients"]] == [
        str(patient.id) for patient in reversed(patients[10:16])
    ]
    for preview in (overview["recent_visits"], overview["no_visit_patients"]):
        assert len(preview) == 6
        assert len({item["id"] for item in preview}) == 6
        assert all("source_record" not in item for item in preview)


def test_overview_preview_ties_use_uuid_and_ages_are_current(
    api_client: TestClient,
    db_session: Session,
    monkeypatch,
) -> None:
    # Insert backwards so stable order cannot accidentally come from insertion order.
    for index in (4, 3, 2, 1):
        db_session.add(
            Patient(
                id=UUID(int=index),
                first_name="Same",
                last_name="Name",
                date_of_birth=date(2000, 5, 10),
                last_visit=date(2020, 1, 1) if index < 3 else None,
            )
        )
    db_session.flush()
    monkeypatch.setattr(dates, "utc_today", lambda: date(2024, 5, 9))
    overview = api_client.get("/dashboard/overview").json()
    assert [item["id"] for item in overview["recent_visits"]] == [str(UUID(int=i)) for i in (1, 2)]
    assert [item["id"] for item in overview["no_visit_patients"]] == [
        str(UUID(int=i)) for i in (3, 4)
    ]
    assert all(
        item["age"] == 23 for item in overview["recent_visits"] + overview["no_visit_patients"]
    )


def test_overview_reflects_patient_changes_immediately(
    api_client: TestClient,
    db_session: Session,
) -> None:
    patient = Patient(first_name="Demo", last_name="Patient", date_of_birth=date(1980, 1, 1))
    db_session.add(patient)
    db_session.flush()
    initial = api_client.get("/dashboard/overview").json()
    assert initial["totals"]["patients"] == initial["totals"]["active"] == 1
    assert initial["totals"]["no_visit"] == 1
    assert initial["recent_visits"] == []
    patient.status = "inactive"
    patient.last_visit = date(2020, 1, 1)
    db_session.flush()
    updated = api_client.get("/dashboard/overview").json()
    assert updated["totals"]["active"] == updated["totals"]["no_visit"] == 0
    assert updated["totals"]["inactive"] == 1
    assert updated["recent_visits"][0]["id"] == str(patient.id)
    assert api_client.delete(f"/patients/{patient.id}").status_code == 204
    assert api_client.get("/dashboard/overview").json()["totals"]["patients"] == 0
