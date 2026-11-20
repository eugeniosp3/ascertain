"""Per-comment unread flags follow the viewer, patient, and creation-time watermark."""

from datetime import UTC, date, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Comment, DiscussionRead, Patient, User


def test_unread_flags_isolate_viewers_patients_and_anonymous_reads(
    api_client: TestClient, db_session: Session, demo_users: tuple[User, User]
) -> None:
    first, second = (
        Patient(first_name=name, last_name="Unread flags", date_of_birth=date(1980, 1, 1))
        for name in ("First", "Second")
    )
    db_session.add_all([first, second])
    db_session.flush()
    cutoff = datetime(2025, 1, 2, tzinfo=UTC)
    records = [
        Comment(
            patient_id=patient_id,
            author_id=author.id,
            body=body,
            created_at=created_at,
            updated_at=created_at,
        )
        for patient_id, author, body, created_at in (
            (first.id, demo_users[0], "Own newer comment", cutoff + timedelta(seconds=2)),
            (first.id, demo_users[1], "Before cutoff", cutoff - timedelta(seconds=1)),
            (first.id, demo_users[1], "Exactly at cutoff", cutoff),
            (first.id, demo_users[1], "After cutoff", cutoff + timedelta(seconds=1)),
            (second.id, demo_users[1], "Different patient", cutoff - timedelta(days=1)),
        )
    ]
    db_session.add_all(records)
    db_session.add(
        DiscussionRead(user_id=demo_users[0].id, patient_id=first.id, last_read_at=cutoff)
    )
    db_session.commit()
    before = db_session.execute(
        select(
            DiscussionRead.user_id,
            DiscussionRead.patient_id,
            DiscussionRead.last_read_at,
            DiscussionRead.updated_at,
        )
    ).all()

    viewer_a, viewer_b = ({"X-Demo-User-ID": str(user.id)} for user in demo_users)
    collection = f"/patients/{first.id}/comments"
    a = api_client.get(collection, headers=viewer_a)
    b = api_client.get(collection, headers=viewer_b)
    anonymous = api_client.get(collection)
    assert a.status_code == b.status_code == anonymous.status_code == 200
    assert {item["body"]: item["is_unread"] for item in a.json()["items"]} == {
        "Own newer comment": False,
        "Before cutoff": False,
        "Exactly at cutoff": False,
        "After cutoff": True,
    }
    assert {item["body"]: item["is_unread"] for item in b.json()["items"]} == {
        "Own newer comment": True,
        "Before cutoff": False,
        "Exactly at cutoff": False,
        "After cutoff": False,
    }
    assert all(item["is_unread"] is False for item in anonymous.json()["items"])
    other_patient = api_client.get(f"/patients/{second.id}/comments", headers=viewer_a)
    assert other_patient.json()["items"][0]["is_unread"] is True
    assert (
        api_client.get(f"/patients/{first.id}", headers=viewer_a).json()["unread_comments_count"]
        == 1
    )
    assert api_client.get("/notifications/summary", headers=viewer_a).json() == {
        "unread_comments": 2,
        "patients_with_unread": 2,
    }
    after = db_session.execute(
        select(
            DiscussionRead.user_id,
            DiscussionRead.patient_id,
            DiscussionRead.last_read_at,
            DiscussionRead.updated_at,
        )
    ).all()
    assert after == before


def test_authored_responses_acknowledgment_and_edits_keep_correct_unread_flags(
    api_client: TestClient, db_session: Session, demo_users: tuple[User, User]
) -> None:
    patient = Patient(
        first_name="Acknowledgment", last_name="Flags", date_of_birth=date(1980, 1, 1)
    )
    db_session.add(patient)
    db_session.commit()
    author, viewer = ({"X-Demo-User-ID": str(user.id)} for user in demo_users)
    collection = f"/patients/{patient.id}/comments"

    first = api_client.post(collection, headers=author, json={"body": "First comment"})
    assert first.status_code == 201 and first.json()["is_unread"] is False
    page = api_client.get(collection, headers=viewer).json()
    assert page["items"][0]["is_unread"] is True
    assert api_client.get(collection, headers=author).json()["items"][0]["is_unread"] is False
    assert db_session.scalar(select(func.count()).select_from(DiscussionRead)) == 0

    acknowledged = api_client.post(
        collection + "/read", headers=viewer, json={"through": page["read_through"]}
    )
    assert acknowledged.status_code == 200
    marker_before = db_session.execute(
        select(DiscussionRead.last_read_at, DiscussionRead.updated_at)
    ).one()
    assert api_client.get(collection, headers=viewer).json()["items"][0]["is_unread"] is False

    edited_read = api_client.put(
        first.headers["Location"], headers=author, json={"body": "Edited read comment"}
    )
    assert edited_read.status_code == 200 and edited_read.json()["is_unread"] is False
    assert edited_read.json()["created_at"] == first.json()["created_at"]
    second = api_client.post(collection, headers=author, json={"body": "New unread comment"})
    assert second.status_code == 201 and second.json()["is_unread"] is False
    edited_unread = api_client.put(
        second.headers["Location"], headers=author, json={"body": "Edited unread comment"}
    )
    assert edited_unread.status_code == 200 and edited_unread.json()["is_unread"] is False
    assert edited_unread.json()["created_at"] == second.json()["created_at"]
    flags = {
        item["id"]: item["is_unread"]
        for item in api_client.get(collection, headers=viewer).json()["items"]
    }
    assert flags == {first.json()["id"]: False, second.json()["id"]: True}
    assert db_session.scalar(select(func.count()).select_from(DiscussionRead)) == 1
    assert (
        db_session.execute(select(DiscussionRead.last_read_at, DiscussionRead.updated_at)).one()
        == marker_before
    )
