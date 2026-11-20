"""Durable unread watermarks, pagination cutoffs and concurrent PostgreSQL sessions."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from threading import Event
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, func, select
from sqlalchemy.orm import Session

from app.models import Comment, DiscussionRead, Patient, User
from app.schemas.comments import CommentWrite
from app.services.comments import create_comment, list_comments, mark_discussion_read
from app.services.notes import require_patient
from app.services.notifications import get_notification_summary


def test_unread_is_per_user_global_and_gets_do_not_mark_read(
    api_client: TestClient, db_session: Session, demo_users: tuple[User, User]
) -> None:
    patients = [
        Patient(first_name=name, last_name="Unread", date_of_birth=date(1980, 1, 1))
        for name in ("First", "Second")
    ]
    db_session.add_all(patients)
    db_session.commit()
    viewer, other = ({"X-Demo-User-ID": str(user.id)} for user in demo_users)
    for patient in patients:
        assert (
            api_client.post(
                f"/patients/{patient.id}/comments", headers=other, json={"body": "Other's comment"}
            ).status_code
            == 201
        )
    own = api_client.post(
        f"/patients/{patients[0].id}/comments", headers=viewer, json={"body": "Own comment"}
    )
    assert own.status_code == 201
    expected = {"unread_comments": 2, "patients_with_unread": 2}
    assert api_client.get("/notifications/summary").status_code == 401
    assert api_client.get("/notifications/summary", headers=viewer).json() == expected
    assert api_client.get("/notifications/summary", headers=other).json() == {
        "unread_comments": 1,
        "patients_with_unread": 1,
    }
    for resource in ("notes", "summary", "comments"):
        assert (
            api_client.get(f"/patients/{patients[0].id}/{resource}", headers=viewer).status_code
            == 200
        )
    assert api_client.get("/notifications/summary", headers=viewer).json() == expected
    assert db_session.scalar(select(func.count()).select_from(DiscussionRead)) == 0


def test_cutoff_excludes_later_comments_is_monotonic_and_edits_do_not_reunread(
    api_client: TestClient, db_session: Session, demo_users: tuple[User, User]
) -> None:
    patient = Patient(first_name="Cutoff", last_name="Example", date_of_birth=date(1980, 1, 1))
    db_session.add(patient)
    db_session.commit()
    viewer, other = ({"X-Demo-User-ID": str(user.id)} for user in demo_users)
    collection = f"/patients/{patient.id}/comments"
    first = api_client.post(collection, headers=other, json={"body": "Observed comment"})
    snapshot = api_client.get(collection, headers=viewer).json()
    second = api_client.post(collection, headers=other, json={"body": "Arrived after snapshot"})
    cutoff = snapshot["read_through"]
    assert datetime.fromisoformat(second.json()["created_at"]) > datetime.fromisoformat(cutoff)
    acknowledged = api_client.post(f"{collection}/read", headers=viewer, json={"through": cutoff})
    assert acknowledged.status_code == 200
    assert api_client.get("/notifications/summary", headers=viewer).json() == {
        "unread_comments": 1,
        "patients_with_unread": 1,
    }
    assert (
        api_client.put(
            first.headers["Location"], headers=other, json={"body": "Edited old comment"}
        ).status_code
        == 200
    )
    assert api_client.get("/notifications/summary", headers=viewer).json()["unread_comments"] == 1
    for older in (cutoff, "2020-01-01T00:00:00Z"):
        repeated = api_client.post(f"{collection}/read", headers=viewer, json={"through": older})
        assert repeated.json()["last_read_at"] == acknowledged.json()["last_read_at"]
    assert api_client.delete(second.headers["Location"], headers=other).status_code == 204
    assert api_client.get("/notifications/summary", headers=viewer).json()["unread_comments"] == 0
    future = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    clamped = api_client.post(f"{collection}/read", headers=viewer, json={"through": future})
    assert clamped.status_code == 200
    database_now = db_session.scalar(select(func.clock_timestamp()))
    assert datetime.fromisoformat(clamped.json()["last_read_at"]) <= database_now
    assert (
        api_client.post(
            f"{collection}/read", headers=viewer, json={"through": "2026-01-01T00:00:00"}
        ).status_code
        == 422
    )
    assert (
        api_client.post(
            f"/patients/{uuid4()}/comments/read", headers=viewer, json={"through": cutoff}
        ).status_code
        == 404
    )


def test_paginated_prefix_does_not_mark_newer_unloaded_pages_read(
    api_client: TestClient, db_session: Session, demo_users: tuple[User, User]
) -> None:
    patient = Patient(first_name="Paged", last_name="Discussion", date_of_birth=date(1980, 1, 1))
    db_session.add(patient)
    db_session.commit()
    viewer, other = ({"X-Demo-User-ID": str(user.id)} for user in demo_users)
    collection = f"/patients/{patient.id}/comments"
    created = [
        api_client.post(collection, headers=other, json={"body": f"Comment {number}"}).json()
        for number in range(3)
    ]
    page = api_client.get(collection, headers=viewer, params={"page_size": 2}).json()
    assert page["total"] == 3 and page["page"] == 1 and page["page_size"] == 2
    assert [item["id"] for item in page["items"]] == [item["id"] for item in created[:2]]
    assert (
        api_client.post(
            f"{collection}/read", headers=viewer, json={"through": page["read_through"]}
        ).status_code
        == 200
    )
    assert api_client.get("/notifications/summary", headers=viewer).json()["unread_comments"] == 1
    last = api_client.get(
        collection, headers=viewer, params={"cursor": page["next_cursor"], "page_size": 2}
    ).json()
    assert (
        api_client.post(
            f"{collection}/read", headers=viewer, json={"through": last["read_through"]}
        ).status_code
        == 200
    )
    assert api_client.get("/notifications/summary", headers=viewer).json()["unread_comments"] == 0
    for params in ({"page": 0}, {"page_size": 0}, {"page_size": 101}):
        assert api_client.get(collection, headers=viewer, params=params).status_code == 422


def test_equal_timestamp_page_boundary_remains_unread_until_group_is_loaded(
    api_client: TestClient, db_session: Session, demo_users: tuple[User, User]
) -> None:
    patient = Patient(first_name="Tied", last_name="Times", date_of_birth=date(1980, 1, 1))
    db_session.add(patient)
    db_session.flush()
    same_time = datetime(2026, 1, 1, tzinfo=UTC)
    db_session.add_all(
        Comment(
            patient_id=patient.id,
            author_id=demo_users[1].id,
            body=f"Tied {number}",
            created_at=same_time,
            updated_at=same_time,
        )
        for number in range(2)
    )
    db_session.commit()
    viewer = {"X-Demo-User-ID": str(demo_users[0].id)}
    collection = f"/patients/{patient.id}/comments"
    first = api_client.get(collection, params={"page_size": 1}, headers=viewer).json()
    assert datetime.fromisoformat(first["read_through"]) < same_time
    assert first["items"][0]["is_unread"] is True
    assert (
        api_client.post(
            f"{collection}/read", headers=viewer, json={"through": first["read_through"]}
        ).status_code
        == 200
    )
    assert api_client.get("/notifications/summary", headers=viewer).json()["unread_comments"] == 2
    last = api_client.get(
        collection, params={"page_size": 1, "cursor": first["next_cursor"]}, headers=viewer
    ).json()
    assert last["items"][0]["is_unread"] is True
    assert (
        api_client.post(
            f"{collection}/read", headers=viewer, json={"through": last["read_through"]}
        ).status_code
        == 200
    )
    assert api_client.get("/notifications/summary", headers=viewer).json()["unread_comments"] == 0
    assert all(
        item["is_unread"] is False
        for item in api_client.get(collection, headers=viewer).json()["items"]
    )


def test_inflight_creation_is_in_snapshot_and_later_creation_stays_unread(
    pg_engine: Engine,
) -> None:
    """Use independent committed sessions, real row locks, and no shared fixture transaction."""
    with Session(pg_engine, expire_on_commit=False) as setup:
        patient = Patient(first_name="Concurrent", last_name="Read", date_of_birth=date(1980, 1, 1))
        viewer = User(display_name="Concurrent viewer")
        writer = User(display_name="Concurrent writer")
        setup.add_all([patient, viewer, writer])
        setup.commit()
        patient_id, viewer_id, writer_id = patient.id, viewer.id, writer.id
    inserted, release, reading = Event(), Event(), Event()

    def inflight_writer():
        with Session(pg_engine, expire_on_commit=False) as session:
            require_patient(session, patient_id, lock=True)
            now = session.execute(select(func.clock_timestamp())).scalar_one()
            comment = Comment(
                patient_id=patient_id,
                author_id=writer_id,
                body="In flight",
                created_at=now,
                updated_at=now,
            )
            session.add(comment)
            session.flush()
            inserted.set()
            assert release.wait(10)
            session.commit()
            return comment.id

    def snapshot_reader():
        with Session(pg_engine, expire_on_commit=False) as session:
            reading.set()
            snapshot = list_comments(session, patient_id, page=1, page_size=20)
            session.commit()
            return snapshot

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            write_future = executor.submit(inflight_writer)
            try:
                assert inserted.wait(10)
                read_future = executor.submit(snapshot_reader)
                assert reading.wait(10)
            finally:
                release.set()
            first_id = write_future.result(timeout=10)
            snapshot = read_future.result(timeout=10)
        assert [item.id for item in snapshot.items] == [first_id]
        with Session(pg_engine, expire_on_commit=False) as session:
            actor = session.get(User, writer_id)
            assert actor is not None
            later = create_comment(session, patient_id, actor, CommentWrite(body="After snapshot"))
            assert later.created_at > snapshot.read_through
        with Session(pg_engine, expire_on_commit=False) as session:
            actor = session.get(User, viewer_id)
            assert actor is not None
            mark_discussion_read(session, patient_id, actor, snapshot.read_through)
        with Session(pg_engine) as verification:
            actor = verification.get(User, viewer_id)
            assert actor is not None
            counts = get_notification_summary(verification, actor)
            # Other tests' fixture rows are uncommitted and invisible to this session.
            assert counts.unread_comments == 1 and counts.patients_with_unread == 1
    finally:
        release.set()
        with Session(pg_engine) as cleanup:
            cleanup.execute(delete(Patient).where(Patient.id == patient_id))
            cleanup.execute(delete(User).where(User.id.in_([viewer_id, writer_id])))
            cleanup.commit()
