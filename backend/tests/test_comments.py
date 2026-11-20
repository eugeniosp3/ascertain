"""Discussion authorship, transactional link replacement and stable tombstones."""

import json
from base64 import urlsafe_b64encode
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import COMMENT_BODY_MAX_LENGTH, Comment, CommentNoteLink, Patient, User
from app.schemas.comments import CommentCursor


@pytest.fixture
def discussion_patient(db_session: Session) -> Patient:
    patient = Patient(first_name="Discussion", last_name="Example", date_of_birth=date(1980, 1, 2))
    db_session.add(patient)
    db_session.commit()
    return patient


def test_comment_edit_author_and_parent_boundaries(
    api_client: TestClient,
    db_session: Session,
    discussion_patient: Patient,
    demo_users: tuple[User, User],
) -> None:
    owner, other = ({"X-Demo-User-ID": str(user.id)} for user in demo_users)
    collection = f"/patients/{discussion_patient.id}/comments"
    created = api_client.post(collection, headers=owner, json={"body": " <b>Plain text</b> "})
    assert created.status_code == 201
    original = created.json()
    assert original["body"] == "<b>Plain text</b>"
    assert original["author"]["id"] == str(demo_users[0].id)
    child = created.headers["Location"]
    assert api_client.put(child, headers=other, json={"body": "Changed"}).status_code == 403
    assert api_client.delete(child, headers=other).status_code == 403
    replacement = api_client.put(child, headers=owner, json={"body": "Edited", "note_ids": []})
    assert replacement.status_code == 200
    assert replacement.json()["author"] == original["author"]
    assert replacement.json()["created_at"] == original["created_at"]
    assert replacement.json()["updated_at"] >= original["updated_at"]
    assert api_client.get(collection).json()["items"][0] == replacement.json()
    other_patient = Patient(first_name="Other", last_name="Patient", date_of_birth=date(1970, 1, 1))
    db_session.add(other_patient)
    db_session.commit()
    wrong = f"/patients/{other_patient.id}/comments/{original['id']}"
    assert api_client.put(wrong, headers=other, json={"body": "Changed"}).status_code == 404
    assert api_client.delete(wrong, headers=other).status_code == 404
    assert api_client.get(f"/patients/{uuid4()}/comments").status_code == 404
    assert api_client.delete(child, headers=owner).status_code == 204
    assert db_session.get(Comment, UUID(original["id"])) is None


def test_multi_note_links_atomic_replacement_and_deleted_existing_links(
    api_client: TestClient,
    db_session: Session,
    discussion_patient: Patient,
    demo_users: tuple[User, User],
) -> None:
    headers = {"X-Demo-User-ID": str(demo_users[0].id)}
    note_collection = f"/patients/{discussion_patient.id}/notes"
    first, second = [
        api_client.post(
            note_collection,
            headers=headers,
            json={"timestamp": "2026-01-01T00:00:00Z", "title": title, "content": "Clinical"},
        ).json()
        for title in ("First note", "Second note")
    ]
    collection = f"/patients/{discussion_patient.id}/comments"
    created = api_client.post(
        collection,
        headers=headers,
        json={"body": "Original", "note_ids": [first["id"], second["id"]]},
    )
    assert created.status_code == 201
    child = created.headers["Location"]
    assert {link["id"] for link in created.json()["note_links"]} == {first["id"], second["id"]}
    assert all(link["url"].startswith(note_collection) for link in created.json()["note_links"])
    assert (
        api_client.put(
            child, headers=headers, json={"body": "Must roll back", "note_ids": [str(uuid4())]}
        ).status_code
        == 422
    )
    unchanged = api_client.get(collection).json()["items"][0]
    assert unchanged["body"] == "Original" and len(unchanged["note_links"]) == 2
    alien = Patient(first_name="Alien", last_name="Patient", date_of_birth=date(1970, 1, 1))
    db_session.add(alien)
    db_session.commit()
    alien_note = api_client.post(
        f"/patients/{alien.id}/notes",
        headers=headers,
        json={"timestamp": "2026-01-01T00:00:00Z", "content": "Other patient"},
    ).json()
    assert (
        api_client.post(
            collection,
            headers=headers,
            json={"body": "Invalid", "note_ids": [first["id"], alien_note["id"]]},
        ).status_code
        == 422
    )
    assert api_client.get(collection).json()["total"] == 1
    assert api_client.delete(f"{note_collection}/{first['id']}", headers=headers).status_code == 204
    retained = api_client.put(
        child, headers=headers, json={"body": "Retained", "note_ids": [first["id"]]}
    )
    assert retained.status_code == 200
    link = retained.json()["note_links"][0]
    assert link["id"] == first["id"] and link["label"] == "Deleted note" and link["is_deleted"]
    assert api_client.get(collection).json()["items"][0]["note_links"] == [link]
    assert (
        api_client.post(
            collection, headers=headers, json={"body": "New reference", "note_ids": [first["id"]]}
        ).status_code
        == 422
    )
    assert api_client.put(child, headers=headers, json={"body": "Unlinked"}).status_code == 200
    assert (
        api_client.put(
            child, headers=headers, json={"body": "Relink", "note_ids": [first["id"]]}
        ).status_code
        == 422
    )
    assert (
        api_client.put(
            child, headers=headers, json={"body": "Active link", "note_ids": [second["id"]]}
        ).status_code
        == 200
    )
    assert api_client.delete(child, headers=headers).status_code == 204
    assert db_session.scalar(select(func.count()).select_from(CommentNoteLink)) == 0


@pytest.mark.parametrize(
    "payload",
    [
        {"body": " "},
        {"body": "a" * (COMMENT_BODY_MAX_LENGTH + 1)},
        {"body": "Spoof", "author_id": str(uuid4())},
    ],
)
def test_comment_validation_and_identity(
    payload: dict,
    api_client: TestClient,
    discussion_patient: Patient,
    demo_users: tuple[User, User],
) -> None:
    url = f"/patients/{discussion_patient.id}/comments"
    assert api_client.post(url, json={"body": "No identity"}).status_code == 401
    assert (
        api_client.post(
            url, json=payload, headers={"X-Demo-User-ID": str(demo_users[0].id)}
        ).status_code
        == 422
    )


def test_cursor_survives_deletion_without_offset_ack_skipping_unseen_comments(
    api_client: TestClient,
    discussion_patient: Patient,
    demo_users: tuple[User, User],
) -> None:
    viewer, author = ({"X-Demo-User-ID": str(user.id)} for user in demo_users)
    collection = f"/patients/{discussion_patient.id}/comments"
    created = [
        api_client.post(collection, headers=author, json={"body": body}) for body in ("A", "B", "C")
    ]
    assert all(response.status_code == 201 for response in created)
    first = api_client.get(collection, params={"page_size": 1}).json()
    assert [item["body"] for item in first["items"]] == ["A"]
    assert first["next_cursor"]
    acknowledged = api_client.post(
        f"{collection}/read", headers=viewer, json={"through": first["read_through"]}
    )
    assert acknowledged.status_code == 200
    assert api_client.delete(created[0].headers["Location"], headers=author).status_code == 204

    # Offset page 2 now skips unseen B. Its cutoff must never advance the marker.
    legacy = api_client.get(collection, params={"page": 2, "page_size": 1}).json()
    assert [item["body"] for item in legacy["items"]] == ["C"]
    assert legacy["next_cursor"] is None
    assert datetime.fromisoformat(legacy["read_through"]) == datetime.min.replace(tzinfo=UTC)
    repeated = api_client.post(
        f"{collection}/read", headers=viewer, json={"through": legacy["read_through"]}
    )
    assert repeated.status_code == 200
    assert repeated.json()["last_read_at"] == acknowledged.json()["last_read_at"]
    assert api_client.get("/notifications/summary", headers=viewer).json()["unread_comments"] == 2

    second = api_client.get(
        collection, params={"cursor": first["next_cursor"], "page_size": 1}
    ).json()
    assert second["page"] == 2 and second["total"] == 2
    assert [item["body"] for item in second["items"]] == ["B"]
    assert second["next_cursor"]
    assert (
        api_client.post(
            f"{collection}/read", headers=viewer, json={"through": second["read_through"]}
        ).status_code
        == 200
    )
    assert api_client.get("/notifications/summary", headers=viewer).json()["unread_comments"] == 1
    last = api_client.get(
        collection, params={"cursor": second["next_cursor"], "page_size": 1}
    ).json()
    assert last["page"] == 3 and last["next_cursor"] is None
    assert [item["body"] for item in last["items"]] == ["C"]
    assert (
        api_client.post(
            f"{collection}/read", headers=viewer, json={"through": last["read_through"]}
        ).status_code
        == 200
    )
    assert api_client.get("/notifications/summary", headers=viewer).json()["unread_comments"] == 0


def test_cursor_equal_timestamp_boundary_requires_the_entire_group(
    api_client: TestClient,
    db_session: Session,
    discussion_patient: Patient,
    demo_users: tuple[User, User],
) -> None:
    same_time = datetime(2026, 1, 1, tzinfo=UTC)
    ids = sorted(uuid4() for _ in range(3))
    db_session.add_all(
        Comment(
            id=comment_id,
            patient_id=discussion_patient.id,
            author_id=demo_users[1].id,
            body=f"Comment {number}",
            created_at=same_time if number < 2 else same_time + timedelta(seconds=1),
            updated_at=same_time + timedelta(seconds=1),
        )
        for number, comment_id in enumerate(ids)
    )
    db_session.commit()
    viewer = {"X-Demo-User-ID": str(demo_users[0].id)}
    collection = f"/patients/{discussion_patient.id}/comments"
    first = api_client.get(collection, params={"page_size": 1}).json()
    assert first["items"][0]["id"] == str(ids[0])
    assert datetime.fromisoformat(first["read_through"]) == same_time - timedelta(microseconds=1)
    assert (
        api_client.post(
            f"{collection}/read", headers=viewer, json={"through": first["read_through"]}
        ).status_code
        == 200
    )
    assert api_client.get("/notifications/summary", headers=viewer).json()["unread_comments"] == 3
    second = api_client.get(
        collection, params={"cursor": first["next_cursor"], "page_size": 1}
    ).json()
    assert second["items"][0]["id"] == str(ids[1])
    assert datetime.fromisoformat(second["read_through"]) == same_time
    assert (
        api_client.post(
            f"{collection}/read", headers=viewer, json={"through": second["read_through"]}
        ).status_code
        == 200
    )
    assert api_client.get("/notifications/summary", headers=viewer).json()["unread_comments"] == 1
    last = api_client.get(
        collection, params={"cursor": second["next_cursor"], "page_size": 1}
    ).json()
    assert last["items"][0]["id"] == str(ids[2])
    assert last["next_cursor"] is None
    assert (
        api_client.post(
            f"{collection}/read", headers=viewer, json={"through": last["read_through"]}
        ).status_code
        == 200
    )
    assert api_client.get("/notifications/summary", headers=viewer).json()["unread_comments"] == 0


def test_cursor_keeps_arrivals_after_initial_snapshot_unread(
    api_client: TestClient,
    discussion_patient: Patient,
    demo_users: tuple[User, User],
) -> None:
    viewer, author = ({"X-Demo-User-ID": str(user.id)} for user in demo_users)
    collection = f"/patients/{discussion_patient.id}/comments"
    for body in ("A", "B", "C"):
        assert api_client.post(collection, headers=author, json={"body": body}).status_code == 201
    first = api_client.get(collection, params={"page_size": 1}).json()
    later = api_client.post(collection, headers=author, json={"body": "After snapshot"})
    assert later.status_code == 201
    # The cursor sets the page number; callers may vary page_size safely.
    last = api_client.get(
        collection, params={"cursor": first["next_cursor"], "page_size": 100, "page": 99}
    ).json()
    assert last["page"] == 2 and last["page_size"] == 100 and last["total"] == 3
    assert [item["body"] for item in last["items"]] == ["B", "C"]
    assert last["next_cursor"] is None
    assert datetime.fromisoformat(last["read_through"]) < datetime.fromisoformat(
        later.json()["created_at"]
    )
    assert (
        api_client.post(
            f"{collection}/read", headers=viewer, json={"through": last["read_through"]}
        ).status_code
        == 200
    )
    assert api_client.get("/notifications/summary", headers=viewer).json()["unread_comments"] == 1
    refreshed = api_client.get(collection).json()
    assert refreshed["total"] == 4
    assert refreshed["items"][-1]["id"] == later.json()["id"]


def test_cursor_preserves_active_note_links_and_deleted_note_tombstones(
    api_client: TestClient,
    discussion_patient: Patient,
    demo_users: tuple[User, User],
) -> None:
    headers = {"X-Demo-User-ID": str(demo_users[0].id)}
    note_collection = f"/patients/{discussion_patient.id}/notes"
    note = api_client.post(
        note_collection,
        headers=headers,
        json={"timestamp": "2026-01-01T00:00:00Z", "title": "Linked note", "content": "Text"},
    ).json()
    collection = f"/patients/{discussion_patient.id}/comments"
    for body in ("A", "B"):
        assert (
            api_client.post(
                collection, headers=headers, json={"body": body, "note_ids": [note["id"]]}
            ).status_code
            == 201
        )
    first = api_client.get(collection, params={"page_size": 1}).json()
    active = first["items"][0]["note_links"][0]
    assert active["id"] == note["id"] and active["title"] == "Linked note"
    assert active["url"] == f"{note_collection}/{note['id']}" and not active["is_deleted"]
    assert api_client.delete(active["url"], headers=headers).status_code == 204
    last = api_client.get(
        collection, params={"cursor": first["next_cursor"], "page_size": 1}
    ).json()
    tombstone = last["items"][0]["note_links"][0]
    assert tombstone["id"] == active["id"] and tombstone["url"] == active["url"]
    assert tombstone["title"] == tombstone["label"] == "Deleted note"
    assert tombstone["is_deleted"] and last["next_cursor"] is None


@pytest.mark.parametrize("has_comment", [False, True])
def test_huge_offset_page_is_empty_and_cannot_advance_read_state(
    has_comment: bool,
    api_client: TestClient,
    discussion_patient: Patient,
    demo_users: tuple[User, User],
) -> None:
    viewer, author = ({"X-Demo-User-ID": str(user.id)} for user in demo_users)
    collection = f"/patients/{discussion_patient.id}/comments"
    if has_comment:
        assert (
            api_client.post(collection, headers=author, json={"body": "Unread"}).status_code == 201
        )
    response = api_client.get(collection, params={"page": 10**100, "page_size": 100})
    assert response.status_code == 200
    payload = response.json()
    assert payload["page"] == 10**100 and payload["page_size"] == 100
    assert payload["items"] == [] and payload["next_cursor"] is None
    assert payload["total"] == int(has_comment)
    assert datetime.fromisoformat(payload["read_through"]) == datetime.min.replace(tzinfo=UTC)
    assert (
        api_client.post(
            f"{collection}/read", headers=viewer, json={"through": payload["read_through"]}
        ).status_code
        == 200
    )
    assert api_client.get("/notifications/summary", headers=viewer).json()[
        "unread_comments"
    ] == int(has_comment)


def test_future_ack_is_clamped_to_database_clock_and_remains_monotonic(
    api_client: TestClient,
    db_session: Session,
    discussion_patient: Patient,
    demo_users: tuple[User, User],
) -> None:
    viewer, author = ({"X-Demo-User-ID": str(user.id)} for user in demo_users)
    collection = f"/patients/{discussion_patient.id}/comments"
    assert api_client.post(collection, headers=author, json={"body": "Seen"}).status_code == 201
    before = db_session.execute(select(func.clock_timestamp())).scalar_one()
    acknowledged = api_client.post(
        f"{collection}/read", headers=viewer, json={"through": "9999-12-31T23:59:59Z"}
    )
    after = db_session.execute(select(func.clock_timestamp())).scalar_one()
    assert acknowledged.status_code == 200
    clamped = datetime.fromisoformat(acknowledged.json()["last_read_at"])
    assert before <= clamped <= after
    for cutoff in ("2020-01-01T00:00:00Z", clamped.isoformat()):
        older = api_client.post(f"{collection}/read", headers=viewer, json={"through": cutoff})
        assert older.status_code == 200
        assert older.json() == acknowledged.json()
    assert (
        api_client.post(collection, headers=author, json={"body": "After clamped ack"}).status_code
        == 201
    )
    assert api_client.get("/notifications/summary", headers=viewer).json()["unread_comments"] == 1
    assert (
        api_client.post(
            f"{collection}/read", headers=viewer, json={"through": "2026-01-01T00:00:00"}
        ).status_code
        == 422
    )
    offset = api_client.post(
        f"{collection}/read", headers=author, json={"through": "2020-01-01T03:00:00+03:00"}
    )
    assert offset.status_code == 200
    assert datetime.fromisoformat(offset.json()["last_read_at"]) == datetime.fromisoformat(
        "2020-01-01T00:00:00+00:00"
    )


@pytest.mark.parametrize(
    "cursor",
    ["", "not-a-cursor", "☃", "e30", "bnVsbA", "a" * 1025],
)
def test_malformed_cursors_are_validation_errors(
    cursor: str,
    api_client: TestClient,
    discussion_patient: Patient,
) -> None:
    response = api_client.get(
        f"/patients/{discussion_patient.id}/comments", params={"cursor": cursor}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_cursor_is_patient_bound_and_validates_snapshot_and_position(
    api_client: TestClient,
    db_session: Session,
    discussion_patient: Patient,
    demo_users: tuple[User, User],
) -> None:
    collection = f"/patients/{discussion_patient.id}/comments"
    author = {"X-Demo-User-ID": str(demo_users[0].id)}
    for body in ("A", "B"):
        assert api_client.post(collection, headers=author, json={"body": body}).status_code == 201
    first = api_client.get(collection, params={"page_size": 1}).json()
    other_patient = Patient(first_name="Other", last_name="Cursor", date_of_birth=date(1980, 1, 1))
    db_session.add(other_patient)
    db_session.commit()
    wrong_patient = api_client.get(
        f"/patients/{other_patient.id}/comments", params={"cursor": first["next_cursor"]}
    )
    assert wrong_patient.status_code == 422
    assert wrong_patient.json()["error"]["code"] == "invalid_discussion_cursor"
    cursor = CommentCursor.decode(first["next_cursor"])
    future = cursor.model_copy(update={"snapshot_at": cursor.snapshot_at + timedelta(days=36500)})
    assert api_client.get(collection, params={"cursor": future.encode()}).status_code == 422
    for change in (
        {"after_created_at": cursor.snapshot_at + timedelta(seconds=1)},
        {"snapshot_at": "2026-01-01T00:00:00"},
        {"after_created_at": "2026-01-01T00:00:00"},
        {"after_id": "not-a-uuid"},
        {"page": 1},
        {"unexpected": "field"},
    ):
        payload = {**cursor.model_dump(mode="json"), **change}
        token = urlsafe_b64encode(json.dumps(payload, default=str).encode()).decode().rstrip("=")
        invalid = api_client.get(collection, params={"cursor": token})
        assert invalid.status_code == 422
        assert invalid.json()["error"]["code"] == "validation_error"


def test_stored_maximum_length_comment_can_round_trip_through_edit(
    api_client: TestClient,
    db_session: Session,
    discussion_patient: Patient,
    demo_users: tuple[User, User],
) -> None:
    body = "x" * COMMENT_BODY_MAX_LENGTH
    comment = Comment(patient_id=discussion_patient.id, author_id=demo_users[0].id, body=body)
    db_session.add(comment)
    db_session.commit()
    collection = f"/patients/{discussion_patient.id}/comments"
    existing = api_client.get(collection).json()["items"][0]
    assert existing["body"] == body
    headers = {"X-Demo-User-ID": str(demo_users[0].id)}
    replacement = api_client.put(
        f"{collection}/{comment.id}", headers=headers, json={"body": existing["body"]}
    )
    assert replacement.status_code == 200
    assert replacement.json()["body"] == body
    assert replacement.json()["created_at"] == existing["created_at"]
    assert api_client.post(collection, headers=headers, json={"body": body}).status_code == 201
    assert (
        api_client.put(
            f"{collection}/{comment.id}", headers=headers, json={"body": body + "x"}
        ).status_code
        == 422
    )
