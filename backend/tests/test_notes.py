"""Clinical note and author boundaries against the migrated PostgreSQL schema."""

from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import NOTE_CONTENT_MAX_LENGTH, Note, NoteAttachment, Patient, User


@pytest.fixture
def clinical_patient(db_session: Session) -> Patient:
    patient = Patient(first_name="Clinical", last_name="Example", date_of_birth=date(1980, 1, 2))
    db_session.add(patient)
    db_session.commit()
    return patient


def test_demo_actor_validation_and_active_user_listing(
    api_client: TestClient,
    db_session: Session,
    demo_users: tuple[User, User],
    clinical_patient: Patient,
) -> None:
    inactive = User(display_name="Inactive user", is_active=False)
    db_session.add(inactive)
    db_session.commit()
    assert api_client.get("/users").json() == [
        {"id": str(user.id), "display_name": user.display_name, "display_role": user.display_role}
        for user in demo_users
    ]
    url = f"/patients/{clinical_patient.id}/notes"
    payload = {"timestamp": "2026-01-01T08:30:00Z", "content": "Clinical observation"}
    assert api_client.get(url).status_code == 200
    for header in (None, "not-a-uuid", str(uuid4()), str(inactive.id)):
        headers = {} if header is None else {"X-Demo-User-ID": header}
        assert api_client.post(url, json=payload, headers=headers).status_code == 401
    assert api_client.get(url, headers={"X-Demo-User-ID": "bad"}).status_code == 401
    assert db_session.scalar(select(func.count()).select_from(Note)) == 0


def test_identity_fails_closed_outside_demo_mode(
    api_client: TestClient,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
    demo_users: tuple[User, User],
    clinical_patient: Patient,
) -> None:
    monkeypatch.setattr(
        api_client.app.app.state, "settings", settings.model_copy(update={"demo_mode": False})
    )
    headers = {"X-Demo-User-ID": str(demo_users[0].id)}
    assert api_client.get("/users", headers=headers).status_code == 503
    assert api_client.get("/dashboard/overview", headers=headers).status_code == 503
    assert (
        api_client.post(
            "/patients",
            headers=headers,
            json={"first_name": "Hidden", "last_name": "Write", "date_of_birth": "1980-01-01"},
        ).status_code
        == 503
    )
    assert api_client.delete(f"/patients/{clinical_patient.id}", headers=headers).status_code == 503
    assert (
        api_client.post(
            f"/patients/{clinical_patient.id}/notes",
            headers=headers,
            json={"timestamp": "2026-01-01T00:00:00Z", "content": "Example"},
        ).status_code
        == 503
    )


def test_notes_order_ownership_edit_and_parent_scoping(
    api_client: TestClient,
    db_session: Session,
    demo_users: tuple[User, User],
    clinical_patient: Patient,
) -> None:
    owner, other = ({"X-Demo-User-ID": str(user.id)} for user in demo_users)
    collection = f"/patients/{clinical_patient.id}/notes"
    older = api_client.post(
        collection,
        headers=owner,
        json={"timestamp": "2026-01-01T11:00:00+03:00", "content": " Older clinical event "},
    )
    assert older.status_code == 201
    original = older.json()
    assert original["title"] == "Clinical note"
    assert original["content"] == "Older clinical event"
    assert original["author"]["id"] == str(demo_users[0].id)
    detail = older.headers["Location"]
    assert api_client.get(detail).json() == original
    recent = api_client.post(
        collection,
        headers=other,
        json={"timestamp": "2026-02-01T00:00:00Z", "title": "Follow-up", "content": "Recent"},
    ).json()
    assert [item["id"] for item in api_client.get(collection).json()] == [
        recent["id"],
        original["id"],
    ]
    replacement = {"timestamp": "2026-03-01T00:00:00Z", "title": "Updated", "content": "Edited"}
    assert api_client.put(detail, headers=other, json=replacement).status_code == 403
    assert api_client.delete(detail, headers=other).status_code == 403
    edited = api_client.put(detail, headers=owner, json=replacement)
    assert edited.status_code == 200
    assert edited.json()["created_at"] == original["created_at"]
    assert edited.json()["author"] == original["author"]
    assert edited.json()["updated_at"] >= original["updated_at"]
    assert api_client.get(collection).json()[0]["id"] == original["id"]
    wrong_patient = Patient(first_name="Other", last_name="Patient", date_of_birth=date(1970, 1, 1))
    db_session.add(wrong_patient)
    db_session.commit()
    wrong_url = f"/patients/{wrong_patient.id}/notes/{original['id']}"
    assert api_client.get(wrong_url).status_code == 404
    assert api_client.put(wrong_url, headers=other, json=replacement).status_code == 404
    assert api_client.delete(wrong_url, headers=other).status_code == 404
    assert api_client.get(f"/patients/{uuid4()}/notes").status_code == 404


@pytest.mark.parametrize(
    "changes",
    [
        {"timestamp": "2026-01-01T12:00:00"},
        {"timestamp": (datetime.now(UTC) + timedelta(days=1)).isoformat()},
        {"content": " "},
        {"content": "a" * (NOTE_CONTENT_MAX_LENGTH + 1)},
        {"title": "a" * 81},
        {"title": " "},
        {"author_id": str(uuid4())},
    ],
)
def test_note_validation(
    changes: dict,
    api_client: TestClient,
    clinical_patient: Patient,
    demo_users: tuple[User, User],
) -> None:
    payload = {"timestamp": "2026-01-01T00:00:00Z", "content": "Clinical text", **changes}
    response = api_client.post(
        f"/patients/{clinical_patient.id}/notes",
        json=payload,
        headers={"X-Demo-User-ID": str(demo_users[0].id)},
    )
    assert response.status_code == 422


def test_attachment_metadata_ownership_and_note_tombstone(
    api_client: TestClient,
    db_session: Session,
    clinical_patient: Patient,
    demo_users: tuple[User, User],
) -> None:
    owner, other = ({"X-Demo-User-ID": str(user.id)} for user in demo_users)
    created = api_client.post(
        f"/patients/{clinical_patient.id}/notes",
        headers=owner,
        json={"timestamp": "2026-01-01T00:00:00Z", "title": "Private title", "content": "Clinical"},
    )
    note_url = created.headers["Location"]
    attachment_url = f"{note_url}/attachments"
    payload = {"display_name": "External report", "source_url": "https://example.org/report.pdf"}
    assert api_client.post(attachment_url, headers=other, json=payload).status_code == 403
    for source in ("http://example.org/a", "file:///tmp/a", "https://user:password@example.org/a"):
        assert (
            api_client.post(
                attachment_url, headers=owner, json={**payload, "source_url": source}
            ).status_code
            == 422
        )
    attached = api_client.post(attachment_url, headers=owner, json=payload)
    assert attached.status_code == 201
    assert api_client.get(note_url).json()["attachments"][0]["id"] == attached.json()["id"]
    assert api_client.delete(attached.headers["Location"], headers=other).status_code == 403
    assert api_client.delete(attached.headers["Location"], headers=owner).status_code == 204
    assert api_client.post(attachment_url, headers=owner, json=payload).status_code == 201
    assert api_client.delete(note_url, headers=owner).status_code == 204
    assert api_client.get(note_url).status_code == 410
    assert api_client.delete(note_url, headers=owner).status_code == 404
    assert api_client.get(f"/patients/{clinical_patient.id}/notes").json() == []
    db_session.expire_all()
    tombstone = db_session.get(Note, UUID(created.json()["id"]))
    assert tombstone is not None
    assert tombstone.title is None and tombstone.content is None
    assert tombstone.deleted_by_id == demo_users[0].id
    assert tombstone.deleted_at is not None
    assert db_session.scalar(select(func.count()).select_from(NoteAttachment)) == 0
