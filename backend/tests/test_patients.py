"""Patient API behavior against the disposable PostgreSQL fixtures; no SQLite fallback."""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Comment,
    CommentNoteLink,
    DiscussionRead,
    Note,
    NoteAttachment,
    Patient,
    SeedRun,
    User,
)
from app.schemas.patient_details import ProfileDetails
from app.schemas.patients import PatientCreate, PatientReplace
from app.services import patients as patient_service
from app.utils import dates

PatientFactory = Callable[..., Patient]
PAST = datetime(2020, 1, 2, 12, tzinfo=UTC)


def test_patient_edit_uses_database_clock_despite_api_host_clock_skew(
    api_client: TestClient,
    patient_payload: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created = api_client.post("/patients", json=patient_payload)
    assert created.status_code == 201
    current_date = dates.utc_today()
    monkeypatch.setattr(dates, "utc_now", lambda: PAST)
    monkeypatch.setattr(dates, "utc_today", lambda: current_date)
    edited = api_client.put(created.headers["Location"], json=patient_payload)
    assert edited.status_code == 200
    assert datetime.fromisoformat(edited.json()["updated_at"]) >= datetime.fromisoformat(
        created.json()["created_at"]
    )


@pytest.fixture
def patient_payload() -> dict[str, Any]:
    return {
        "first_name": "Maya",
        "middle_initial": "A",
        "last_name": "Okafor",
        "date_of_birth": "1984-03-12",
        "phone": "+1 (212) 555-0101 ext. 12",
        "email": "maya@example.com",
        "address_line1": "12 Main Street",
        "address_line2": "Unit 2",
        "city": "New York",
        "state": "NY",
        "postal_code": "00123",
        "blood_type": "O+",
        "status": "active",
        "last_visit": "2020-01-01",
        "conditions": [{"code": None, "label": "Hypertension"}],
        "allergies": ["Penicillin (rash)"],
        "allergy_status": "reported",
    }


@pytest.fixture
def make_patient(db_session: Session) -> PatientFactory:
    def create(**overrides: Any) -> Patient:
        values: dict[str, Any] = {
            "id": uuid4(),
            "first_name": "Maya",
            "last_name": "Okafor",
            "date_of_birth": date(1984, 3, 12),
        }
        values.update(overrides)
        patient = Patient(**values)
        db_session.add(patient)
        db_session.flush()
        return patient

    return create


@pytest.fixture
def sourced_patient(make_patient: PatientFactory, db_session: Session) -> Patient:
    # Complete typed context is independent of any seed transport or local data artifact.
    profile = ProfileDetails.model_validate(
        {
            "identity": {
                "age_years": 42,
                "sex_at_birth": "Female",
                "gender_identity": "Woman",
                "race": "Black",
                "ethnicity": "Not Hispanic",
                "preferred_language": "English",
                "interpreter_needed": False,
                "marital_status": "Married",
                "employment_status": "Employed",
            },
            "contact": {
                "home_phone": None,
                "mobile_phone": "212-555-0101",
                "emergency_contact_name": "Alex",
                "emergency_contact_relationship": "Spouse",
                "emergency_contact_phone": "212-555-0102",
            },
            "care_team": {
                "pcp_name": "Demo PCP",
                "pcp_npi": "0012345678",
                "home_facility_key": "DEMO",
                "first_registered_date": "2018-01-01",
            },
            "coverage": {
                "primary_payer_name": "Demo Payer",
                "primary_line_of_business": "Commercial",
                "primary_plan_name": "Demo Plan",
                "primary_plan_type": "PPO",
                "primary_member_id": "0000123",
                "primary_group_number": None,
                "primary_coverage_effective_date": "2018-01-01",
                "secondary_payer_name": None,
                "secondary_member_id": None,
            },
            "clinical": {
                "primary_clinical_story": "Fictional clinical context.",
                "height_cm": "170.00",
                "weight_kg": "70.00",
                "bmi": "24.22",
                "smoking_status": "Never",
                "alcohol_use": "None",
                "has_hypertension": True,
                "has_diabetes": "None",
                "has_ckd": False,
                "has_copd": False,
                "has_heart_failure": False,
                "has_cad": False,
                "has_afib": False,
                "has_osa": False,
                "has_depression": False,
                "has_obesity": False,
                "has_cancer_history": False,
                "charlson_comorbidity_index": 0,
                "active_medications": None,
            },
            "labs": {
                "last_labs_date": "2020-01-01",
                "last_hba1c_pct": "5.40",
                "last_egfr": 95,
                "last_creatinine_mg_dl": "0.80",
                "last_ldl_mg_dl": 100,
                "last_hemoglobin_g_dl": "13.50",
                "hospitalizations_12mo": 0,
                "ed_visits_12mo": 0,
            },
            "social": {
                "housing_status": "Stable",
                "transportation_barrier": False,
                "advance_directive_on_file": False,
                "code_status": "Full",
                "pa_request_count": 0,
            },
        }
    )
    run = SeedRun(
        dataset_key=f"patients-test-{uuid4()}",
        dataset_date=date(2020, 1, 1),
        source_hashes={},
        export_manifest={},
        row_counts={"patients": 1},
    )
    db_session.add(run)
    db_session.flush()
    return make_patient(
        source_patient_id="PT-0001",
        mrn="0000123",
        seed_run_id=run.id,
        source_lineage={
            "bronze_id": str(uuid4()),
            "silver_id": str(uuid4()),
            "source_row_number": 1,
            "source_file_id": str(uuid4()),
            "transformation_version": "v1",
        },
        source_record={"first_name": "Original", "private_source_field": "not-for-the-api"},
        profile_details=profile.model_dump(mode="json"),
        source_created_at=PAST,
        source_updated_at=PAST,
    )


def add_note(db_session: Session, patient: Patient, author: User, *, deleted: bool = False) -> Note:
    note = Note(
        patient_id=patient.id,
        author_id=author.id,
        timestamp=PAST,
        title=None if deleted else "Clinical visit",
        content=None if deleted else "Clinical content",
        deleted_at=PAST if deleted else None,
        deleted_by_id=author.id if deleted else None,
    )
    db_session.add(note)
    db_session.flush()
    return note


def add_comment(
    db_session: Session, patient: Patient, author: User, created_at: datetime = PAST
) -> Comment:
    comment = Comment(
        patient_id=patient.id,
        author_id=author.id,
        body="Discussion only",
        created_at=created_at,
        updated_at=created_at,
    )
    db_session.add(comment)
    db_session.flush()
    return comment


def test_create_read_replace_delete_commits_profile(
    api_client: TestClient, db_session: Session, patient_payload: dict[str, Any]
) -> None:
    response = api_client.post("/patients", json={**patient_payload, "first_name": "  Maya  "})
    assert response.status_code == 201
    patient = response.json()
    patient_id = patient["id"]
    assert response.headers["location"] == f"/patients/{patient_id}"
    assert patient["name"] == "Maya A Okafor"
    assert patient["first_name"] == "Maya"
    assert patient["postal_code"] == "00123"
    assert patient["source_patient_id"] is None
    assert patient["source_lineage"] is None
    assert patient["profile_details"] is None
    assert "source_record" not in patient
    db_session.expire_all()
    assert db_session.get(Patient, UUID(patient_id)).email == "maya@example.com"
    assert api_client.get(f"/patients/{patient_id}").json() == patient

    replacement = {
        **patient_payload,
        "first_name": "Sam",
        "middle_initial": None,
        "phone": None,
        "email": None,
        "address_line2": None,
        "blood_type": None,
        "last_visit": None,
        "status": "inactive",
        "conditions": [],
        "allergies": [],
        "allergy_status": "no_known",
    }
    updated = api_client.put(f"/patients/{patient_id}", json=replacement)
    assert updated.status_code == 200
    assert updated.json()["name"] == "Sam Okafor"
    assert updated.json()["created_at"] == patient["created_at"]
    assert updated.json()["updated_at"] >= patient["updated_at"]
    for field, value in replacement.items():
        assert updated.json()[field] == value
    db_session.expire_all()
    assert db_session.get(Patient, UUID(patient_id)).phone is None
    deleted = api_client.delete(f"/patients/{patient_id}")
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert api_client.get(f"/patients/{patient_id}").status_code == 404


def test_minimal_post_has_documented_defaults(api_client: TestClient) -> None:
    response = api_client.post(
        "/patients",
        json={"first_name": "Maya", "last_name": "Okafor", "date_of_birth": "1984-03-12"},
    )
    assert response.status_code == 201
    patient = response.json()
    assert patient["status"] == "active"
    assert patient["allergies"] == patient["conditions"] == []
    assert patient["allergy_status"] == "unknown"
    assert patient["blood_type"] is patient["phone"] is patient["last_visit"] is None
    assert (
        patient["notes_count"] == patient["comments_count"] == patient["unread_comments_count"] == 0
    )


def test_replace_preserves_original_source_context(
    api_client: TestClient,
    db_session: Session,
    sourced_patient: Patient,
    patient_payload: dict[str, Any],
) -> None:
    original = {
        field: getattr(sourced_patient, field)
        for field in (
            "source_patient_id",
            "mrn",
            "seed_run_id",
            "source_record",
            "source_lineage",
            "profile_details",
            "source_created_at",
            "source_updated_at",
        )
    }
    response = api_client.put(f"/patients/{sourced_patient.id}", json=patient_payload)
    assert response.status_code == 200
    detail = response.json()
    assert "source_record" not in detail
    assert "not-for-the-api" not in response.text
    assert detail["source_lineage"]["export_id"] is None
    assert detail["source_lineage"]["source_row_number"] == 1
    assert detail["profile_details"]["clinical"]["height_cm"] == "170.00"
    assert detail["profile_details"]["clinical"]["has_diabetes"] == "None"
    assert detail["profile_details"]["coverage"]["primary_member_id"] == "0000123"
    db_session.expire_all()
    persisted = db_session.get(Patient, sourced_patient.id)
    for field, value in original.items():
        assert getattr(persisted, field) == value


@pytest.mark.parametrize("missing", ["phone", "status", "conditions", "allergy_status"])
def test_put_requires_nullable_and_defaulted_fields(
    api_client: TestClient,
    make_patient: PatientFactory,
    patient_payload: dict[str, Any],
    missing: str,
) -> None:
    patient = make_patient()
    del patient_payload[missing]
    response = api_client.put(f"/patients/{patient.id}", json=patient_payload)
    assert response.status_code == 422
    assert any(field["path"] == ["body", missing] for field in response.json()["error"]["fields"])


@pytest.mark.parametrize(
    "changes",
    [
        {"first_name": " \t\n "},
        {"last_name": ""},
        {"middle_initial": "AB"},
        {"email": "private-invalid-contact"},
        {"phone": "telephone please"},
        {"phone": "1234"},
        {"state": "New York"},
        {"postal_code": "12345678901"},
        {"status": "critical"},
        {"blood_type": "C+"},
        {"allergy_status": "missing"},
        {"allergies": []},
        {"allergy_status": "unknown"},
        {"allergy_status": "no_known"},
        {"allergies": ["   "]},
        {"conditions": [{"code": None, "label": "  "}]},
        {"conditions": [{"code": "X", "label": "Valid", "unapproved": True}]},
        {"date_of_birth": (dates.utc_today() + timedelta(days=1)).isoformat()},
        {"last_visit": (dates.utc_today() + timedelta(days=1)).isoformat()},
        {"mrn": "server-owned"},
        {"source_patient_id": "server-owned"},
        {"source_record": {"secret": "original"}},
        {"profile_details": {}},
    ],
)
def test_invalid_profiles_return_safe_422_without_inserting(
    api_client: TestClient,
    db_session: Session,
    patient_payload: dict[str, Any],
    changes: dict[str, Any],
) -> None:
    response = api_client.post("/patients", json={**patient_payload, **changes})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert "private-invalid-contact" not in response.text
    assert db_session.scalar(select(func.count(Patient.id))) == 0


@pytest.mark.parametrize("method", ["get", "put", "delete"])
def test_missing_and_malformed_patient_id(
    api_client: TestClient, patient_payload: dict[str, Any], method: str
) -> None:
    kwargs = {"json": patient_payload} if method == "put" else {}
    missing = api_client.request(method, f"/patients/{uuid4()}", **kwargs)
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "patient_not_found"
    malformed = api_client.request(method, "/patients/not-a-uuid", **kwargs)
    assert malformed.status_code == 422


def test_search_and_status_filter_cover_dataset_before_pagination(
    api_client: TestClient,
    make_patient: PatientFactory,
) -> None:
    for index in range(105):
        make_patient(
            first_name=f"Person{index:03}",
            last_name="Directory",
            email=f"person{index:03}@example.com",
            status="inactive" if index % 3 == 0 else "active",
        )
    default = api_client.get("/patients").json()
    assert default["total"] == 105 and len(default["items"]) == 20
    filtered = api_client.get(
        "/patients", params={"q": "DIRECTORY", "status": "inactive", "page": 2, "page_size": 10}
    ).json()
    assert filtered["total"] == 35
    assert filtered["page"] == 2 and filtered["page_size"] == 10
    assert [item["first_name"] for item in filtered["items"]] == [
        f"Person{index:03}" for index in range(30, 60, 3)
    ]
    last = api_client.get("/patients", params={"q": "PERSON104@EXAMPLE.COM"}).json()
    assert last["total"] == 1 and last["items"][0]["first_name"] == "Person104"
    assert last["items"][0]["date_of_birth"] == "1984-03-12"
    beyond = api_client.get("/patients", params={"q": "Directory", "page": 50}).json()
    assert beyond["items"] == [] and beyond["total"] == 105
    huge_page = api_client.get("/patients", params={"page": str(10**100)}).json()
    assert huge_page["items"] == [] and huge_page["total"] == 105


@pytest.mark.parametrize("q", ["maya", "okafor", "  MAYA OKAFOR  ", "pt-0001", "0000123"])
def test_search_names_source_id_and_mrn(
    api_client: TestClient, sourced_patient: Patient, q: str
) -> None:
    response = api_client.get("/patients", params={"q": q})
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [str(sourced_patient.id)]


def test_search_full_name_with_middle_initial_and_application_uuid(
    api_client: TestClient,
    make_patient: PatientFactory,
) -> None:
    patient = make_patient(middle_initial="A")
    for q in ("maya a okafor", str(patient.id).upper()):
        assert api_client.get("/patients", params={"q": q}).json()["total"] == 1


@pytest.mark.parametrize("literal", ["%", "_", "\\"])
def test_search_escapes_like_wildcards(
    api_client: TestClient, make_patient: PatientFactory, literal: str
) -> None:
    wanted = make_patient(first_name=f"Literal{literal}Name")
    make_patient(first_name="LiteralOtherName")
    response = api_client.get("/patients", params={"q": literal}).json()
    assert response["total"] == 1
    assert response["items"][0]["id"] == str(wanted.id)


def test_search_with_nul_character_is_a_safe_422(api_client: TestClient) -> None:
    response = api_client.get("/patients", params={"q": "a\x00b"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_value"


@pytest.mark.parametrize(
    "params",
    [
        {"page": 0},
        {"page": -1},
        {"page_size": 0},
        {"page_size": 101},
        {"page": "abc"},
        {"sort_by": "unsafe SQL"},
        {"order": "random"},
        {"status": "critical"},
        {"q": "x" * 201},
        {"unread_only": "nonsense"},
    ],
)
def test_invalid_list_query_returns_422(api_client: TestClient, params: dict[str, Any]) -> None:
    assert api_client.get("/patients", params=params).status_code == 422


@pytest.mark.parametrize("order", ["asc", "desc"])
def test_name_sort_and_equal_name_uuid_ties_are_stable(
    api_client: TestClient,
    make_patient: PatientFactory,
    order: str,
) -> None:
    low = make_patient(id=UUID(int=1), first_name="Same", last_name="Baker")
    high = make_patient(id=UUID(int=2), first_name="Same", last_name="Baker")
    other = make_patient(id=UUID(int=3), first_name="Alice", last_name="Adams")
    expected = [other, low, high] if order == "asc" else [low, high, other]
    actual = []
    for page in range(1, 4):
        response = api_client.get(
            "/patients", params={"sort_by": "name", "order": order, "page": page, "page_size": 1}
        ).json()
        actual.append(response["items"][0]["id"])
    assert actual == [str(patient.id) for patient in expected]


@pytest.mark.parametrize("order", ["asc", "desc"])
def test_visit_sort_always_places_nulls_last(
    api_client: TestClient,
    make_patient: PatientFactory,
    order: str,
) -> None:
    missing = make_patient(id=UUID(int=1), last_visit=None)
    early = make_patient(id=UUID(int=2), last_visit=date(2018, 1, 1))
    late = make_patient(id=UUID(int=3), last_visit=date(2020, 1, 1))
    tied = make_patient(id=UUID(int=4), last_visit=date(2020, 1, 1))
    expected = [early, late, tied, missing] if order == "asc" else [late, tied, early, missing]
    response = api_client.get("/patients", params={"sort_by": "last_visit", "order": order})
    assert [item["id"] for item in response.json()["items"]] == [str(p.id) for p in expected]


@pytest.mark.parametrize("sort_by", ["dob", "status"])
@pytest.mark.parametrize("order", ["asc", "desc"])
def test_birth_date_and_status_sort(
    api_client: TestClient,
    make_patient: PatientFactory,
    sort_by: str,
    order: str,
) -> None:
    a = make_patient(id=UUID(int=1), date_of_birth=date(1970, 1, 1), status="active")
    b = make_patient(id=UUID(int=2), date_of_birth=date(1990, 1, 1), status="inactive")
    expected = [a, b] if order == "asc" else [b, a]
    response = api_client.get("/patients", params={"sort_by": sort_by, "order": order})
    assert [item["id"] for item in response.json()["items"]] == [str(p.id) for p in expected]


@pytest.mark.parametrize("sort_by", ["notes_count", "notes", "comments_count", "comments"])
@pytest.mark.parametrize("order", ["asc", "desc"])
def test_child_counts_and_count_sort_exclude_tombstones_without_join_multiplication(
    api_client: TestClient,
    db_session: Session,
    make_patient: PatientFactory,
    demo_users: tuple[User, User],
    sort_by: str,
    order: str,
) -> None:
    a = make_patient(id=UUID(int=1))
    b = make_patient(id=UUID(int=2))
    add_note(db_session, a, demo_users[0])
    add_note(db_session, a, demo_users[0])
    add_note(db_session, a, demo_users[0], deleted=True)
    for _ in range(3):
        add_comment(db_session, a, demo_users[1])
    add_comment(db_session, a, demo_users[0])
    expected = [b, a] if order == "asc" else [a, b]
    response = api_client.get("/patients", params={"sort_by": sort_by, "order": order}).json()
    assert response["total"] == 2
    assert [item["id"] for item in response["items"]] == [str(p.id) for p in expected]
    detail = api_client.get(f"/patients/{a.id}").json()
    row = next(item for item in response["items"] if item["id"] == str(a.id))
    assert row["notes_count"] == detail["notes_count"] == 2
    assert row["comments_count"] == detail["comments_count"] == 4
    assert row["unread_comments_count"] == detail["unread_comments_count"] == 0


def test_unread_uses_actor_strict_creation_cutoff_and_whole_dataset_filter(
    api_client: TestClient,
    db_session: Session,
    make_patient: PatientFactory,
    demo_users: tuple[User, User],
) -> None:
    viewer, other = demo_users
    read = make_patient(id=UUID(int=1), first_name="Read")
    never_read = make_patient(id=UUID(int=2), first_name="Never")
    own_only = make_patient(id=UUID(int=3), first_name="Own")
    add_comment(db_session, read, other, PAST - timedelta(seconds=1))
    boundary = add_comment(db_session, read, other, PAST)
    boundary.updated_at = PAST + timedelta(
        days=1
    )  # Editing an old comment does not make it unread.
    add_comment(db_session, read, other, PAST + timedelta(microseconds=1))
    add_comment(db_session, read, viewer, PAST + timedelta(days=2))
    add_comment(db_session, never_read, other)
    add_comment(db_session, never_read, other)
    add_comment(db_session, own_only, viewer)
    db_session.add(DiscussionRead(user_id=viewer.id, patient_id=read.id, last_read_at=PAST))
    db_session.flush()
    headers = {"X-Demo-User-ID": str(viewer.id)}
    response = api_client.get(
        "/patients", params={"unread_only": True, "page_size": 1, "page": 2}, headers=headers
    )
    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert response.json()["items"][0]["id"] == str(read.id)
    assert response.json()["items"][0]["unread_comments_count"] == 1
    detail = api_client.get(f"/patients/{never_read.id}", headers=headers).json()
    assert detail["comments_count"] == detail["unread_comments_count"] == 2
    assert (
        api_client.get(f"/patients/{own_only.id}", headers=headers).json()["unread_comments_count"]
        == 0
    )
    assert api_client.get("/patients", params={"unread_only": True}).status_code == 401
    assert api_client.get("/patients", headers={"X-Demo-User-ID": str(uuid4())}).status_code == 401
    filtered = api_client.get(
        "/patients", params={"unread_only": True, "q": "Never", "status": "active"}, headers=headers
    ).json()
    assert filtered["total"] == 1
    marker = db_session.get(DiscussionRead, (viewer.id, read.id))
    assert marker.last_read_at == PAST  # List/detail reads do not mark discussions read.
    # Read markers are per user; the other actor has never read the viewer's comments.
    assert (
        api_client.get(f"/patients/{read.id}", headers={"X-Demo-User-ID": str(other.id)}).json()[
            "unread_comments_count"
        ]
        == 1
    )


def test_delete_cascades_active_deleted_and_linked_children_but_keeps_users_and_seed_run(
    api_client: TestClient,
    db_session: Session,
    sourced_patient: Patient,
    demo_users: tuple[User, User],
) -> None:
    active = add_note(db_session, sourced_patient, demo_users[0])
    deleted = add_note(db_session, sourced_patient, demo_users[0], deleted=True)
    comment = add_comment(db_session, sourced_patient, demo_users[1])
    attachment = NoteAttachment(
        note_id=active.id,
        added_by_id=demo_users[0].id,
        display_name="Lab source",
        source_url="https://example.com/demo-lab.pdf",
    )
    db_session.add_all(
        [
            attachment,
            CommentNoteLink(
                comment_id=comment.id, note_id=active.id, patient_id=sourced_patient.id
            ),
            CommentNoteLink(
                comment_id=comment.id, note_id=deleted.id, patient_id=sourced_patient.id
            ),
            DiscussionRead(
                user_id=demo_users[0].id, patient_id=sourced_patient.id, last_read_at=PAST
            ),
        ]
    )
    db_session.flush()
    seed_id = sourced_patient.seed_run_id
    assert api_client.delete(f"/patients/{sourced_patient.id}").status_code == 204
    for model in (Patient, Note, Comment, NoteAttachment, CommentNoteLink, DiscussionRead):
        assert db_session.scalar(select(func.count()).select_from(model)) == 0
    assert db_session.scalar(select(func.count(User.id))) == 2
    assert db_session.get(SeedRun, seed_id) is not None


def test_real_uniqueness_conflict_is_safe_and_request_session_recovers(
    api_client: TestClient,
    db_session: Session,
    make_patient: PatientFactory,
    patient_payload: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = make_patient(first_name="Original")
    existing_id = existing.id
    db_session.commit()
    # Exercise the PostgreSQL constraint without an ORM identity-map warning.
    db_session.expunge_all()
    with monkeypatch.context() as patch:
        patch.setattr(patient_service, "uuid4", lambda: existing_id)
        response = api_client.post("/patients", json=patient_payload)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "patient_conflict"
    assert "INSERT" not in response.text and "maya@example.com" not in response.text
    assert db_session.is_active
    assert db_session.get(Patient, existing_id).first_name == "Original"
    assert api_client.post("/patients", json=patient_payload).status_code == 201
    assert db_session.scalar(select(func.count(Patient.id))) == 2


def test_failed_commit_rolls_back_insert_and_returns_safe_error(
    api_client: TestClient,
    db_session: Session,
    patient_payload: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_commit() -> None:
        raise RuntimeError("private database details")

    with monkeypatch.context() as patch:
        patch.setattr(db_session, "commit", fail_commit)
        response = api_client.post("/patients", json=patient_payload)
    assert response.status_code == 500
    assert "private database details" not in response.text
    assert db_session.scalar(select(func.count(Patient.id))) == 0
    assert api_client.post("/patients", json=patient_payload).status_code == 201


@pytest.mark.parametrize(
    ("dob", "today", "expected"),
    [
        (date(2000, 5, 10), date(2024, 5, 9), 23),
        (date(2000, 5, 10), date(2024, 5, 10), 24),
        (date(2000, 5, 10), date(2024, 5, 11), 24),
        (date(2000, 2, 29), date(2023, 2, 28), 22),
        (date(2000, 2, 29), date(2023, 3, 1), 23),
        (date(2000, 2, 29), date(2024, 2, 29), 24),
    ],
)
def test_age_uses_completed_calendar_years(dob: date, today: date, expected: int) -> None:
    assert dates.calculate_age(dob, today) == expected


def test_api_age_uses_current_date(
    api_client: TestClient,
    make_patient: PatientFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    patient = make_patient(date_of_birth=date(2000, 5, 10))
    monkeypatch.setattr(dates, "utc_today", lambda: date(2024, 5, 9))
    assert api_client.get(f"/patients/{patient.id}").json()["age"] == 23
    assert api_client.get("/patients").json()["items"][0]["age"] == 23


def test_put_schema_requires_every_writable_field(patient_payload: dict[str, Any]) -> None:
    assert {
        name for name, field in PatientReplace.model_fields.items() if field.is_required()
    } == set(patient_payload)
    assert (
        PatientCreate.model_validate(
            {"first_name": "Maya", "last_name": "Okafor", "date_of_birth": "1984-03-12"}
        ).middle_initial
        is None
    )
