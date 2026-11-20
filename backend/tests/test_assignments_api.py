"""Persisted workload assignment: actor-scoped reads, server-owned writes, shared CRUD.

The first group needs no database: every SQL-capable dependency is replaced by an
unbound session, so a request that reached the database would raise instead of pass.
The rest run against the disposable PostgreSQL fixtures with two real actor cohorts.
"""

from collections.abc import Callable, Iterator
from datetime import UTC, date, datetime
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import get_session
from app.dependencies import get_optional_user
from app.errors import AppError
from app.main import create_app
from app.models import Comment, Note, Patient, User
from app.schemas.patients import PatientCreate, PatientEditable, PatientReplace
from app.services import patients as patient_service

PatientFactory = Callable[..., Patient]
ClientFactory = Callable[[User | None], TestClient]
PAST = datetime(2020, 1, 2, 12, tzinfo=UTC)
EDITABLE_FIELDS = frozenset(
    {
        "first_name",
        "middle_initial",
        "last_name",
        "date_of_birth",
        "phone",
        "email",
        "address_line1",
        "address_line2",
        "city",
        "state",
        "postal_code",
        "blood_type",
        "status",
        "last_visit",
        "conditions",
        "allergies",
        "allergy_status",
    }
)


def as_actor(user: User) -> dict[str, str]:
    return {"X-Demo-User-ID": str(user.id)}


def user_json(user: User) -> dict[str, Any]:
    return {
        "id": str(user.id),
        "display_name": user.display_name,
        "display_role": user.display_role,
    }


@pytest.fixture
def profile() -> dict[str, Any]:
    """Every editable field, valid for both POST and the full-replacement PUT."""
    return {
        "first_name": "Maya",
        "middle_initial": None,
        "last_name": "Okafor",
        "date_of_birth": "1984-03-12",
        "phone": None,
        "email": None,
        "address_line1": None,
        "address_line2": None,
        "city": None,
        "state": None,
        "postal_code": None,
        "blood_type": None,
        "status": "active",
        "last_visit": None,
        "conditions": [],
        "allergies": [],
        "allergy_status": "unknown",
    }


@pytest.fixture
def unbound_client(settings: Settings) -> ClientFactory:
    """Build a client whose actor is fixed and whose session cannot execute SQL."""

    def build(actor: User | None) -> TestClient:
        application = create_app(settings)
        api = cast(FastAPI, application.app)

        def unbound_session() -> Iterator[Session]:
            with Session() as session:
                yield session

        api.dependency_overrides[get_session] = unbound_session
        api.dependency_overrides[get_optional_user] = lambda: actor
        return TestClient(application)

    return build


@pytest.fixture
def make_patient(db_session: Session) -> PatientFactory:
    def create(owner: User | None = None, **overrides: Any) -> Patient:
        values: dict[str, Any] = {
            "id": uuid4(),
            "first_name": "Demo",
            "last_name": "Patient",
            "date_of_birth": date(1980, 1, 1),
            "assigned_user_id": owner.id if owner is not None else None,
        }
        values.update(overrides)
        patient = Patient(**values)
        db_session.add(patient)
        db_session.flush()
        return patient

    return create


def add_notes(
    db_session: Session, patient: Patient, author: User, count: int, *, deleted: bool = False
) -> None:
    for _ in range(count):
        db_session.add(
            Note(
                patient_id=patient.id,
                author_id=author.id,
                timestamp=PAST,
                title=None if deleted else "Visit",
                content=None if deleted else "Fictional clinical note",
                deleted_at=PAST if deleted else None,
                deleted_by_id=author.id if deleted else None,
            )
        )
    db_session.flush()


# --- Contract checks that never reach PostgreSQL -------------------------------------


def test_write_schemas_keep_exactly_the_17_editable_fields() -> None:
    for model in (PatientEditable, PatientCreate, PatientReplace):
        assert set(model.model_fields) == EDITABLE_FIELDS
        assert model.model_config.get("extra") == "forbid"
    required = {name for name, field in PatientReplace.model_fields.items() if field.is_required()}
    assert required == EDITABLE_FIELDS


def test_openapi_documents_read_only_assignment_and_scoped_reads(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        schema = client.get("/openapi.json").json()
    components = schema["components"]["schemas"]
    for path, method in (("/patients", "post"), ("/patients/{patient_id}", "put")):
        content = schema["paths"][path][method]["requestBody"]["content"]
        body = components[content["application/json"]["schema"]["$ref"].rsplit("/", 1)[-1]]
        assert set(body["properties"]) == EDITABLE_FIELDS
        assert body["additionalProperties"] is False
    for name in ("PatientListItem", "PatientDetail", "DashboardPatient"):
        assert "assigned_user_id" in components[name]["required"]
        assert components[name]["properties"]["assigned_user_id"]["anyOf"] == [
            {"type": "string", "format": "uuid"},
            {"type": "null"},
        ]
    overview = components["DashboardOverview"]
    assert {"scope", "assigned_user", "totals", "recent_visits", "no_visit_patients"} <= set(
        overview["required"]
    )
    assert overview["properties"]["scope"]["enum"] == ["global", "assigned"]
    assert overview["properties"]["assigned_user"]["anyOf"] == [
        {"$ref": "#/components/schemas/UserResponse"},
        {"type": "null"},
    ]
    listing = {p["name"]: p for p in schema["paths"]["/patients"]["get"]["parameters"]}
    assert listing["assigned_to"]["in"] == "query"
    assert listing["assigned_to"]["required"] is False
    options = listing["assigned_to"]["schema"]["anyOf"]
    literal = next(option for option in options if option != {"type": "null"})
    assert {"type": "null"} in options
    assert literal.get("enum", [literal.get("const")]) == ["me"]
    dashboard = {p["name"]: p for p in schema["paths"]["/dashboard/overview"]["get"]["parameters"]}
    assert dashboard["scope"]["in"] == "query"
    assert dashboard["scope"]["required"] is False
    assert dashboard["scope"]["schema"]["enum"] == ["global", "assigned"]
    assert dashboard["scope"]["schema"]["default"] == "global"


@pytest.mark.parametrize("anonymous", [True, False])
@pytest.mark.parametrize(
    ("path", "name", "value"),
    [
        *(
            ("/patients", "assigned_to", value)
            for value in ("all", "ME", "", "me ", "true", str(UUID(int=1)))
        ),
        *(
            ("/dashboard/overview", "scope", value)
            for value in ("mine", "ASSIGNED", "", "me", "Global")
        ),
    ],
)
def test_unknown_filter_and_scope_values_are_rejected_before_sql(
    unbound_client: ClientFactory, anonymous: bool, path: str, name: str, value: str
) -> None:
    actor = None if anonymous else User(id=uuid4(), display_name="Probe", is_active=True)
    with unbound_client(actor) as client:
        response = client.get(path, params={name: value})
    assert response.status_code == 422
    assert response.json() == {
        "error": {
            "code": "validation_error",
            "message": "Request validation failed.",
            "fields": [
                {
                    "path": ["query", name],
                    "code": "literal_error",
                    "message": "Value is not one of the allowed choices.",
                }
            ],
        }
    }


@pytest.mark.parametrize(
    ("path", "params"),
    [
        ("/patients", {"assigned_to": "me"}),
        (
            "/patients",
            {"assigned_to": "me", "unread_only": True, "q": "maya", "status": "active"},
        ),
        ("/dashboard/overview", {"scope": "assigned"}),
    ],
)
def test_anonymous_assigned_views_are_rejected_before_sql(
    unbound_client: ClientFactory, path: str, params: dict[str, Any]
) -> None:
    with unbound_client(None) as client:
        response = client.get(path, params=params)
    assert response.status_code == 401
    assert response.json() == {
        "error": {
            "code": "demo_user_required",
            "message": "Select an active demo user.",
            "fields": [],
        }
    }


@pytest.mark.parametrize("method", ["POST", "PUT"])
@pytest.mark.parametrize("field", ["assigned_user_id", "assigned_to", "assigned_user"])
def test_write_bodies_reject_assignment_fields_before_sql(
    unbound_client: ClientFactory, profile: dict[str, Any], method: str, field: str
) -> None:
    actor = User(id=uuid4(), display_name="Probe", is_active=True)
    path = "/patients" if method == "POST" else f"/patients/{uuid4()}"
    with unbound_client(actor) as client:
        response = client.request(method, path, json={**profile, field: str(actor.id)})
    assert response.status_code == 422
    assert response.json()["error"]["fields"] == [
        {"path": ["body", field], "code": "extra_forbidden", "message": "Unexpected field."}
    ]


# --- PostgreSQL behavior with two real actor cohorts ----------------------------------


def test_assigned_list_partitions_actor_cohorts_before_total_and_pagination(
    api_client: TestClient, make_patient: PatientFactory, demo_users: tuple[User, User]
) -> None:
    a, b = demo_users
    # Interleaved names: a page-local filter would return A's rows from global pages only.
    owners = [a if i % 2 == 0 else (b if i % 4 == 1 else None) for i in range(12)]
    patients = [make_patient(owner, last_name=f"Cohort{i:02}") for i, owner in enumerate(owners)]

    pages = [
        api_client.get(
            "/patients",
            params={"assigned_to": "me", "page_size": 4, "page": page},
            headers=as_actor(a),
        )
        for page in (1, 2, 3)
    ]
    assert [page.status_code for page in pages] == [200, 200, 200]
    assert [page.json()["total"] for page in pages] == [6, 6, 6]
    assert [[item["id"] for item in page.json()["items"]] for page in pages] == [
        [str(patients[i].id) for i in (0, 2, 4, 6)],
        [str(patients[i].id) for i in (8, 10)],
        [],
    ]
    assert {item["assigned_user_id"] for page in pages for item in page.json()["items"]} == {
        str(a.id)
    }

    mine = api_client.get("/patients", params={"assigned_to": "me"}, headers=as_actor(b)).json()
    assert mine["total"] == 3
    assert [item["id"] for item in mine["items"]] == [str(patients[i].id) for i in (1, 5, 9)]
    assert {item["assigned_user_id"] for item in mine["items"]} == {str(b.id)}

    expected = {
        str(patient.id): str(owner.id) if owner is not None else None
        for patient, owner in zip(patients, owners, strict=True)
    }
    for headers in (as_actor(a), {}):
        directory = api_client.get("/patients", params={"page_size": 100}, headers=headers).json()
        assert directory["total"] == 12
        assert {item["id"]: item["assigned_user_id"] for item in directory["items"]} == expected
    assert api_client.get(f"/patients/{patients[3].id}").json()["assigned_user_id"] is None
    assert api_client.get(f"/patients/{patients[1].id}").json()["assigned_user_id"] == str(b.id)


def test_assigned_filter_combines_with_search_status_unread_and_sort(
    api_client: TestClient,
    db_session: Session,
    make_patient: PatientFactory,
    demo_users: tuple[User, User],
) -> None:
    a, b = demo_users
    visited = make_patient(
        a, id=UUID(int=1), first_name="Shared", last_name="Alpha", last_visit=date(2020, 1, 1)
    )
    inactive = make_patient(
        a,
        id=UUID(int=2),
        first_name="Shared",
        last_name="Bravo",
        status="inactive",
        last_visit=date(2021, 1, 1),
    )
    noted = make_patient(a, id=UUID(int=3), first_name="Solo", last_name="Charlie")
    other = make_patient(
        b,
        id=UUID(int=4),
        first_name="Shared",
        last_name="Delta",
        status="inactive",
        last_visit=date(2022, 1, 1),
    )
    unassigned = make_patient(
        None, id=UUID(int=5), first_name="Shared", last_name="Echo", status="inactive"
    )
    # B's comments are unread for A on every patient; only A's cohort may count them.
    for patient in (inactive, other, unassigned):
        db_session.add(
            Comment(
                patient_id=patient.id,
                author_id=b.id,
                body="Discussion only",
                created_at=PAST,
                updated_at=PAST,
            )
        )
    add_notes(db_session, noted, a, 2)

    def mine(**params: Any) -> tuple[int, list[str]]:
        response = api_client.get(
            "/patients", params={"assigned_to": "me", **params}, headers=as_actor(a)
        )
        assert response.status_code == 200
        return response.json()["total"], [item["id"] for item in response.json()["items"]]

    assert mine(q="shared") == (2, [str(visited.id), str(inactive.id)])
    assert mine(status="inactive") == (1, [str(inactive.id)])
    assert mine(q="SHARED", status="inactive") == (1, [str(inactive.id)])
    assert mine(unread_only=True) == (1, [str(inactive.id)])
    assert mine(sort_by="last_visit", order="desc") == (
        3,
        [str(inactive.id), str(visited.id), str(noted.id)],
    )
    assert mine(sort_by="notes_count", order="desc") == (
        3,
        [str(noted.id), str(visited.id), str(inactive.id)],
    )
    assert mine(q="shared", page=2, page_size=1) == (2, [str(inactive.id)])
    # The same filters without assigned_to still span the shared directory.
    unread = api_client.get("/patients", params={"unread_only": True}, headers=as_actor(a))
    assert unread.json()["total"] == 3
    assert api_client.get("/patients", params={"q": "shared"}).json()["total"] == 4


def test_assigned_dashboard_scopes_totals_notes_and_previews_to_one_cohort(
    api_client: TestClient,
    db_session: Session,
    make_patient: PatientFactory,
    demo_users: tuple[User, User],
) -> None:
    a, b = demo_users
    # A has seven visits (one more than a preview holds) and two patients without one.
    a_visited = [
        make_patient(
            a,
            id=UUID(int=10 + i),
            last_name=f"Assigned{i}",
            last_visit=date(2019, 1, 1 + i),
            status="inactive" if i < 2 else "active",
        )
        for i in range(7)
    ]
    a_unvisited = [make_patient(a, id=UUID(int=20 + i), last_name=f"Zulu{i}") for i in range(2)]
    # Other cohorts are newer and sort first by name, so any leak would surface first.
    b_visited = make_patient(b, id=UUID(int=30), last_name="Aaron", last_visit=date(2024, 1, 1))
    b_unvisited = make_patient(b, id=UUID(int=31), last_name="Abbott")
    open_visited = make_patient(
        None, id=UUID(int=40), last_name="Able", last_visit=date(2025, 1, 1), status="inactive"
    )
    open_unvisited = make_patient(None, id=UUID(int=41), last_name="Adams")
    # Note totals follow the patient's assignment, never the note author.
    add_notes(db_session, a_visited[0], a, 2)
    add_notes(db_session, a_unvisited[0], b, 1)
    add_notes(db_session, a_visited[1], a, 1, deleted=True)
    add_notes(db_session, b_visited, a, 4)
    add_notes(db_session, open_visited, a, 5)

    def overview(user: User | None, scope: str | None) -> dict[str, Any]:
        response = api_client.get(
            "/dashboard/overview",
            params={} if scope is None else {"scope": scope},
            headers=as_actor(user) if user is not None else {},
        )
        assert response.status_code == 200
        return cast(dict[str, Any], response.json())

    def ids(preview: list[dict[str, Any]]) -> list[str]:
        return [item["id"] for item in preview]

    mine = overview(a, "assigned")
    assert mine["scope"] == "assigned"
    assert mine["assigned_user"] == user_json(a)
    assert mine["totals"] == {
        "patients": 9,
        "active": 7,
        "inactive": 2,
        "clinical_notes": 3,
        "no_visit": 2,
    }
    assert ids(mine["recent_visits"]) == [str(a_visited[i].id) for i in (6, 5, 4, 3, 2, 1)]
    assert ids(mine["no_visit_patients"]) == [str(patient.id) for patient in a_unvisited]
    assert {
        item["assigned_user_id"] for item in mine["recent_visits"] + mine["no_visit_patients"]
    } == {str(a.id)}

    theirs = overview(b, "assigned")
    assert theirs["scope"] == "assigned"
    assert theirs["assigned_user"] == user_json(b)
    assert theirs["totals"] == {
        "patients": 2,
        "active": 2,
        "inactive": 0,
        "clinical_notes": 4,
        "no_visit": 1,
    }
    assert ids(theirs["recent_visits"]) == [str(b_visited.id)]
    assert ids(theirs["no_visit_patients"]) == [str(b_unvisited.id)]

    shared = overview(None, None)
    assert overview(a, None) == overview(a, "global") == overview(None, "global") == shared
    assert shared["scope"] == "global"
    assert shared["assigned_user"] is None
    assert shared["totals"] == {
        "patients": 13,
        "active": 10,
        "inactive": 3,
        "clinical_notes": 12,
        "no_visit": 4,
    }
    assert ids(shared["recent_visits"]) == [
        str(patient.id) for patient in (open_visited, b_visited, *a_visited[6:2:-1])
    ]
    assert ids(shared["no_visit_patients"]) == [
        str(patient.id) for patient in (b_unvisited, open_unvisited, *a_unvisited)
    ]
    assert [item["assigned_user_id"] for item in shared["recent_visits"][:3]] == [
        None,
        str(b.id),
        str(a.id),
    ]


def test_empty_assigned_cohort_reports_zero_totals_and_empty_previews(
    api_client: TestClient,
    db_session: Session,
    make_patient: PatientFactory,
    demo_users: tuple[User, User],
) -> None:
    a, b = demo_users
    add_notes(db_session, make_patient(a, last_visit=date(2020, 1, 1)), a, 2)
    make_patient(None)
    empty = api_client.get("/dashboard/overview", params={"scope": "assigned"}, headers=as_actor(b))
    assert empty.status_code == 200
    assert empty.json() == {
        "scope": "assigned",
        "assigned_user": user_json(b),
        "totals": {"patients": 0, "active": 0, "inactive": 0, "clinical_notes": 0, "no_visit": 0},
        "recent_visits": [],
        "no_visit_patients": [],
    }
    listed = api_client.get("/patients", params={"assigned_to": "me"}, headers=as_actor(b))
    assert listed.json() == {"items": [], "total": 0, "page": 1, "page_size": 20}
    assert api_client.get("/dashboard/overview", headers=as_actor(b)).json()["totals"] == {
        "patients": 2,
        "active": 2,
        "inactive": 0,
        "clinical_notes": 2,
        "no_visit": 1,
    }


@pytest.mark.parametrize(
    ("path", "params"),
    [("/patients", {"assigned_to": "me"}), ("/dashboard/overview", {"scope": "assigned"})],
)
def test_assigned_views_require_a_valid_active_actor(
    api_client: TestClient,
    db_session: Session,
    make_patient: PatientFactory,
    demo_users: tuple[User, User],
    path: str,
    params: dict[str, str],
) -> None:
    retired = User(display_name="Retired Demo User", display_role=None, is_active=False)
    db_session.add(retired)
    db_session.flush()
    patient = make_patient(retired)  # Assignment survives deactivation; scoped views do not.
    missing = api_client.get(path, params=params)
    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "demo_user_required"
    for header in ("not-a-uuid", str(uuid4()), str(retired.id)):
        rejected = api_client.get(path, params=params, headers={"X-Demo-User-ID": header})
        assert rejected.status_code == 401
        assert rejected.json()["error"]["code"] == "invalid_demo_user"
        assert header not in rejected.text
    allowed = api_client.get(path, params=params, headers=as_actor(demo_users[0]))
    assert allowed.status_code == 200
    # The unscoped resource stays available without an actor and still shows the assignment.
    assert api_client.get(path).status_code == 200
    detail = api_client.get(f"/patients/{patient.id}").json()
    assert detail["assigned_user_id"] == str(retired.id)


def test_create_assigns_selected_actor_and_anonymous_create_stays_unassigned(
    api_client: TestClient,
    db_session: Session,
    demo_users: tuple[User, User],
    profile: dict[str, Any],
) -> None:
    a, b = demo_users
    created: dict[str, dict[str, Any]] = {}
    for label, headers in (("a", as_actor(a)), ("b", as_actor(b)), ("anonymous", {})):
        response = api_client.post(
            "/patients", json={**profile, "last_name": f"Created {label}"}, headers=headers
        )
        assert response.status_code == 201
        created[label] = response.json()
    assert {label: body["assigned_user_id"] for label, body in created.items()} == {
        "a": str(a.id),
        "b": str(b.id),
        "anonymous": None,
    }
    db_session.expire_all()
    assert {
        label: db_session.get(Patient, UUID(body["id"])).assigned_user_id
        for label, body in created.items()
    } == {"a": a.id, "b": b.id, "anonymous": None}
    for body in created.values():
        assert api_client.get(f"/patients/{body['id']}").json() == body
    for label, user in (("a", a), ("b", b)):
        mine = api_client.get("/patients", params={"assigned_to": "me"}, headers=as_actor(user))
        assert [item["id"] for item in mine.json()["items"]] == [created[label]["id"]]
        dashboard = api_client.get(
            "/dashboard/overview", params={"scope": "assigned"}, headers=as_actor(user)
        ).json()
        assert dashboard["totals"]["patients"] == 1
        assert [item["id"] for item in dashboard["no_visit_patients"]] == [created[label]["id"]]
    assert api_client.get("/patients").json()["total"] == 3


@pytest.mark.parametrize("smuggled", ["editor", "owner", "null"])
def test_write_bodies_reject_assignment_without_changing_rows(
    api_client: TestClient,
    db_session: Session,
    make_patient: PatientFactory,
    demo_users: tuple[User, User],
    profile: dict[str, Any],
    smuggled: str,
) -> None:
    owner, editor = demo_users
    patient = make_patient(owner, first_name="Original")
    value = {"editor": str(editor.id), "owner": str(owner.id), "null": None}[smuggled]
    for method, path in (("POST", "/patients"), ("PUT", f"/patients/{patient.id}")):
        response = api_client.request(
            method, path, json={**profile, "assigned_user_id": value}, headers=as_actor(editor)
        )
        assert response.status_code == 422
        assert response.json()["error"]["fields"] == [
            {
                "path": ["body", "assigned_user_id"],
                "code": "extra_forbidden",
                "message": "Unexpected field.",
            }
        ]
    db_session.expire_all()
    assert db_session.scalar(select(func.count(Patient.id))) == 1
    persisted = db_session.get(Patient, patient.id)
    assert persisted is not None
    assert (persisted.assigned_user_id, persisted.first_name) == (owner.id, "Original")


def test_replace_preserves_assignment_and_crud_stays_shared(
    api_client: TestClient,
    db_session: Session,
    make_patient: PatientFactory,
    demo_users: tuple[User, User],
    profile: dict[str, Any],
) -> None:
    owner, other = demo_users
    owned = make_patient(owner)
    unowned = make_patient(None)
    for index, headers in enumerate((as_actor(other), {}, as_actor(owner))):
        response = api_client.put(
            f"/patients/{owned.id}", json={**profile, "first_name": f"Edit{index}"}, headers=headers
        )
        assert response.status_code == 200
        assert response.json()["first_name"] == f"Edit{index}"
        assert response.json()["assigned_user_id"] == str(owner.id)
    # Editing never claims an unassigned patient for the editor.
    edited = api_client.put(f"/patients/{unowned.id}", json=profile, headers=as_actor(owner))
    assert edited.status_code == 200
    assert edited.json()["assigned_user_id"] is None
    db_session.expire_all()
    assert db_session.get(Patient, owned.id).assigned_user_id == owner.id
    assert db_session.get(Patient, unowned.id).assigned_user_id is None
    # Assignment is workload membership only: it adds no access rule for anyone.
    for headers in (as_actor(other), {}):
        assert api_client.get(f"/patients/{owned.id}", headers=headers).status_code == 200
    shared = api_client.get("/patients", headers=as_actor(other)).json()
    assert {item["id"] for item in shared["items"]} == {str(owned.id), str(unowned.id)}
    assert api_client.delete(f"/patients/{owned.id}", headers=as_actor(other)).status_code == 204
    remaining = api_client.get("/patients", params={"assigned_to": "me"}, headers=as_actor(owner))
    assert remaining.json()["total"] == 0


def test_create_for_a_vanished_actor_maps_the_assignment_fk_to_a_safe_401(
    db_session: Session, demo_users: tuple[User, User]
) -> None:
    # The actor row disappears after identity resolution; the FK must not become a 500.
    vanished = User(id=uuid4(), display_name="Removed after selection", is_active=True)
    payload = PatientCreate.model_validate(
        {"first_name": "Maya", "last_name": "Okafor", "date_of_birth": "1984-03-12"}
    )
    with pytest.raises(AppError) as raised:
        patient_service.create_patient(db_session, payload, vanished)
    assert (raised.value.status_code, raised.value.code) == (401, "invalid_demo_user")
    assert str(vanished.id) not in raised.value.message
    assert db_session.scalar(select(func.count(Patient.id))) == 0
    recovered = patient_service.create_patient(db_session, payload, demo_users[0])
    assert recovered.assigned_user_id == demo_users[0].id
