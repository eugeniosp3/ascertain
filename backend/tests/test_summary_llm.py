"""Stored LLM summaries over template FACTS: mocked urlopen only, never the real network."""

import hashlib
import json
import logging
import urllib.error
import urllib.request
from collections.abc import Iterator
from datetime import date
from email.message import Message
from typing import Any, cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import delete, event, func, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import get_session
from app.main import create_app
from app.models import Patient, PatientSummary, User
from app.services import summaries

BASE_URL = "https://llm.example.test/v1"


class FakeResponse:
    """The slice of an HTTP response the service reads."""

    def __init__(self, payload: object, status: int = 200) -> None:
        self.status = status
        self.body = json.dumps(payload).encode()

    def read(self, *_args: object) -> bytes:
        return self.body

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None


def completion(content: object) -> dict[str, Any]:
    return {"choices": [{"message": {"role": "assistant", "content": content}}]}


class FakeUrlopen:
    """Records each request; answers "Narrative N." by default, or a canned result."""

    def __init__(self, result: FakeResponse | BaseException | None = None) -> None:
        self.result = result
        self.calls: list[tuple[urllib.request.Request, float]] = []

    def __call__(self, request: urllib.request.Request, timeout: float) -> FakeResponse:
        self.calls.append((request, timeout))
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result or FakeResponse(completion(f"  Narrative {len(self.calls)}.  "))


def install(
    monkeypatch: pytest.MonkeyPatch, result: FakeResponse | BaseException | None = None
) -> FakeUrlopen:
    fake = FakeUrlopen(result)
    monkeypatch.setattr(urllib.request, "urlopen", fake)
    return fake


def stored_rows(session: Session, patient_id: object) -> list[PatientSummary]:
    query = select(PatientSummary).where(PatientSummary.patient_id == patient_id)
    return list(session.scalars(query.execution_options(populate_existing=True)))


@pytest.fixture
def llm_client(settings: Settings, db_session: Session) -> Iterator[TestClient]:
    configured = Settings(
        app_env="test",
        database_url=None,
        demo_mode=True,
        summary_provider="llm",
        llm_base_url=f"{BASE_URL}/",
        llm_model="test-model",
        llm_timeout_seconds=3,
    )
    application = create_app(configured)
    api = cast(FastAPI, application.app)

    def use_test_session() -> Iterator[Session]:
        yield db_session

    api.dependency_overrides[get_session] = use_test_session
    with TestClient(application, raise_server_exceptions=False) as client:
        yield client


@pytest.fixture
def patient(db_session: Session) -> Patient:
    record = Patient(
        first_name="Fictional",
        last_name="Person",
        date_of_birth=date(1970, 5, 5),
        blood_type="O-",
        conditions=[{"code": "E11", "label": "Type 2 diabetes"}],
        allergy_status="no_known",
    )
    db_session.add(record)
    db_session.commit()
    return record


def test_llm_success_sends_facts_and_stores_the_row(
    llm_client: TestClient, patient: Patient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = install(monkeypatch)
    response = llm_client.get(f"/patients/{patient.id}/summary")
    assert response.status_code == 200
    result = response.json()
    assert result["method"] == "llm" and result["model"] == "test-model"
    assert result["summary"] == "Narrative 1." and result["patient_id"] == str(patient.id)

    [(request, timeout)] = fake.calls
    assert timeout == 3
    assert request.full_url == f"{BASE_URL}/chat/completions"
    assert request.get_method() == "POST"
    assert request.get_header("Authorization") == "Bearer unused"
    assert request.get_header("Content-type") == "application/json"
    body = json.loads(cast(bytes, request.data))
    assert body["model"] == "test-model"
    assert body["max_tokens"] == 350 and body["temperature"] == 0.2
    system, user = body["messages"]
    assert system == {"role": "system", "content": summaries.SYSTEM_PROMPT}
    assert user["role"] == "user"
    assert "Fictional Person" in user["content"] and "Type 2 diabetes" in user["content"]
    assert "There are no clinical notes yet" in user["content"]

    [row] = stored_rows(db_session, patient.id)
    assert (row.summary, row.method, row.model) == ("Narrative 1.", "llm", "test-model")
    assert row.facts_hash == hashlib.sha256(f"test-model\n{user['content']}".encode()).hexdigest()
    assert row.generated_at.isoformat().replace("+00:00", "Z") == result["generated_at"]


def test_unchanged_facts_reuse_the_stored_summary_without_a_call(
    llm_client: TestClient,
    patient: Patient,
    demo_users: tuple[User, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install(monkeypatch)
    url = f"/patients/{patient.id}/summary"
    first = llm_client.get(url).json()
    headers = {"X-Demo-User-ID": str(demo_users[0].id)}
    comment = llm_client.post(
        f"/patients/{patient.id}/comments", headers=headers, json={"body": "Team chat only."}
    )
    assert comment.status_code == 201  # Discussion is not part of FACTS.
    second = llm_client.get(url).json()
    assert len(fake.calls) == 1
    assert second == first and second["method"] == "llm"


def test_adding_or_editing_a_note_regenerates_the_summary(
    llm_client: TestClient,
    patient: Patient,
    db_session: Session,
    demo_users: tuple[User, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = install(monkeypatch)
    url = f"/patients/{patient.id}/summary"
    headers = {"X-Demo-User-ID": str(demo_users[0].id)}
    assert llm_client.get(url).json()["summary"] == "Narrative 1."
    note = llm_client.post(
        f"/patients/{patient.id}/notes",
        headers=headers,
        json={"timestamp": "2026-01-01T00:00:00Z", "title": "Visit", "content": "Stable."},
    )
    assert note.status_code == 201
    assert llm_client.get(url).json()["summary"] == "Narrative 2."
    assert "Stable." in json.loads(cast(bytes, fake.calls[1][0].data))["messages"][1]["content"]
    edited = llm_client.put(
        note.headers["Location"],
        headers=headers,
        json={"timestamp": "2026-01-01T00:00:00Z", "title": "Visit", "content": "Improved."},
    )
    assert edited.status_code == 200
    assert llm_client.get(url).json()["summary"] == "Narrative 3."
    assert llm_client.get(url).json()["summary"] == "Narrative 3."
    assert len(fake.calls) == 3
    [row] = stored_rows(db_session, patient.id)  # Still one row per patient, now the latest.
    assert row.summary == "Narrative 3."


def test_deleting_the_patient_cascades_the_stored_summary(
    llm_client: TestClient, patient: Patient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    install(monkeypatch)
    assert llm_client.get(f"/patients/{patient.id}/summary").json()["method"] == "llm"
    assert len(stored_rows(db_session, patient.id)) == 1
    assert llm_client.delete(f"/patients/{patient.id}").status_code == 204
    count = select(func.count()).select_from(PatientSummary)
    assert db_session.scalar(count.where(PatientSummary.patient_id == patient.id)) == 0


@pytest.mark.parametrize(
    "error",
    [
        urllib.error.HTTPError(BASE_URL, 503, "Service Unavailable", Message(), None),
        urllib.error.URLError("unreachable"),
        TimeoutError("timed out"),
    ],
    ids=["http-error", "url-error", "timeout"],
)
def test_network_failures_return_the_template_unstored_with_one_safe_warning(
    llm_client: TestClient,
    patient: Patient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    error: BaseException,
) -> None:
    install(monkeypatch, error)
    with caplog.at_level(logging.WARNING, logger="app.services.summaries"):
        result = llm_client.get(f"/patients/{patient.id}/summary").json()
    assert result["method"] == "template" and result["model"] is None
    assert "Fictional Person is a" in result["summary"]
    [record] = [r for r in caplog.records if r.name == "app.services.summaries"]
    assert record.levelno == logging.WARNING
    message = record.getMessage()
    assert type(error).__name__ in message
    assert "Fictional" not in message and str(error) not in message
    assert stored_rows(db_session, patient.id) == []


@pytest.mark.parametrize(
    "response",
    [
        FakeResponse(completion("   ")),
        FakeResponse(completion(None)),
        FakeResponse({"choices": []}),
        FakeResponse({"unexpected": "shape"}),
        FakeResponse(completion("Accepted but not done."), status=202),
    ],
    ids=["blank", "null", "no-choices", "wrong-shape", "non-200"],
)
def test_unusable_responses_return_the_template_unstored(
    llm_client: TestClient,
    patient: Patient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    response: FakeResponse,
) -> None:
    fake = install(monkeypatch, response)
    result = llm_client.get(f"/patients/{patient.id}/summary").json()
    assert result["method"] == "template" and result["model"] is None
    assert "Blood type is O-." in result["summary"]
    assert len(fake.calls) == 1 and stored_rows(db_session, patient.id) == []


def test_template_provider_never_touches_the_table_or_network(
    api_client: TestClient, patient: Patient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = install(monkeypatch)
    statements: list[str] = []

    def record(*args: Any) -> None:
        statements.append(args[2])

    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", record)
    try:
        result = api_client.get(f"/patients/{patient.id}/summary").json()
    finally:
        event.remove(connection, "before_cursor_execute", record)
    assert result["method"] == "template" and result["model"] is None
    assert any("FROM patients" in statement for statement in statements)
    assert not any("patient_summaries" in statement for statement in statements)
    assert fake.calls == []


def test_patient_deleted_during_the_llm_call_returns_404(
    llm_client: TestClient, patient: Patient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    def delete_then_answer(request: urllib.request.Request, timeout: float) -> FakeResponse:
        db_session.execute(delete(Patient).where(Patient.id == patient.id))
        db_session.commit()
        return FakeResponse(completion("Too late."))

    monkeypatch.setattr(urllib.request, "urlopen", delete_then_answer)
    response = llm_client.get(f"/patients/{patient.id}/summary")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "patient_not_found"


@pytest.mark.parametrize(
    "overrides",
    [
        {"llm_base_url": "ftp://llm.example.test"},
        {"llm_base_url": "not a url"},
        {"llm_timeout_seconds": 0},
        {"llm_timeout_seconds": 61},
        {"summary_provider": "other"},
    ],
)
def test_llm_settings_are_validated(settings: Settings, overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        Settings.model_validate(overrides)


def test_llm_settings_defaults_and_env_names(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    defaults = Settings()
    assert defaults.summary_provider == "llm"
    assert defaults.llm_base_url == "https://api.llm7.io/v1"
    assert defaults.llm_model == "gemma-3-27b" and defaults.llm_timeout_seconds == 10
    monkeypatch.setenv("SUMMARY_PROVIDER", "template")
    monkeypatch.setenv("LLM_BASE_URL", "http://localhost:11434/v1/")
    monkeypatch.setenv("LLM_MODEL", "gpt-oss:20b")
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "5")
    configured = Settings()
    assert configured.summary_provider == "template"
    assert configured.llm_base_url == "http://localhost:11434/v1"
    assert configured.llm_model == "gpt-oss:20b" and configured.llm_timeout_seconds == 5
