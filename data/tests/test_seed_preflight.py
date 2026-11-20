"""Seed checks that need no PostgreSQL server: configuration, package, adapter, contracts.

``RefusingWriter`` is a test double that fails the test if any code path reaches a write.
"""

import socket
import sys
import types
from pathlib import Path
from uuid import UUID

import pytest
from conftest import MakeRepo
from pydantic import SecretStr
from sqlalchemy import Connection, Engine
from sqlalchemy import types as sqltypes
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import URL

from patient_data import seed
from patient_data.errors import PatientDataError
from patient_data.package import ValidatedPackage
from patient_data.seed import DATA_IMPORT_CONTRACT, load_persistence, run_seed
from patient_data.settings import PATIENTS_FILE, SeedSettings
from patient_data.utils.database import TargetColumn, TargetContract, TargetTable, type_family


class RefusingWriter:
    """Declares a contract; any call to ``write_patients`` fails the test."""

    def target_contract(self) -> TargetContract:
        return TargetContract(tables=(), supported_revisions=frozenset({"rev"}))

    def write_patients(
        self, package: ValidatedPackage, connection: Connection, *, seed_run_id: UUID
    ) -> int:
        raise AssertionError("writer must not be called")


@pytest.fixture
def package_dir(exported_package: Path) -> Path:
    return exported_package


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _settings(**values: object) -> SeedSettings:
    return SeedSettings.model_construct(**{**SeedSettings().model_dump(), **values})


def _status(outcome: seed.SeedOutcome, name: str) -> str:
    return next(r.status for r in outcome.report.results if r.name == name)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "PATIENT_SEED_DATABASE_URL",
        "PATIENT_SEED_SCHEMA",
        "PATIENT_SEED_PACKAGE_DIR",
        "PATIENT_SEED_WRITER",
    ):
        monkeypatch.delenv(name, raising=False)


def test_missing_configuration_is_reported_and_nothing_connects() -> None:
    def no_engine(url: URL, settings: SeedSettings) -> Engine:
        raise AssertionError("must not connect without configuration")

    outcome = run_seed(
        _settings(package_dir=Path("/nonexistent")),
        check_only=False,
        persistence=RefusingWriter(),
        engine_factory=no_engine,
    )
    assert outcome.status == "not_ready" and outcome.exit_code == 1
    assert _status(outcome, "config.database_url") == "failed"
    assert _status(outcome, "config.schema") == "failed"
    assert _status(outcome, "package") == "failed"
    assert _status(outcome, "database") == "blocked"


def test_default_run_without_backend_writer_is_blocked(package_dir: Path) -> None:
    url = SecretStr(f"postgresql://user:pw@127.0.0.1:{_free_port()}/db")
    outcome = run_seed(
        _settings(
            database_url=url, schema_name="public", package_dir=package_dir, connect_timeout_s=1
        ),
        check_only=False,
    )
    assert _status(outcome, "backend.persistence") == "blocked"
    assert "not available yet" in next(
        r.message for r in outcome.report.results if r.name == "backend.persistence"
    )
    assert outcome.exit_code == 1


def test_unreachable_database_fails_without_leaking_credentials(package_dir: Path) -> None:
    url = SecretStr(f"postgresql://seeduser:hunter2secret@127.0.0.1:{_free_port()}/db")
    outcome = run_seed(
        _settings(
            database_url=url, schema_name="public", package_dir=package_dir, connect_timeout_s=1
        ),
        check_only=True,
        persistence=RefusingWriter(),
    )
    assert outcome.status == "not_ready"
    assert _status(outcome, "database.connect") == "failed"
    text = repr(outcome.report)
    assert "hunter2secret" not in text and "seeduser" not in text


def test_non_postgres_url_and_unsafe_schema_are_rejected(package_dir: Path) -> None:
    outcome = run_seed(
        _settings(
            database_url=SecretStr("mysql://u:p@h/db"),
            schema_name="public; drop",
            package_dir=package_dir,
        ),
        check_only=True,
        persistence=RefusingWriter(),
    )
    assert _status(outcome, "config.database_url") == "failed"
    assert _status(outcome, "config.schema") == "failed"


def test_invalid_package_is_reported(package_dir: Path, tmp_path: Path) -> None:
    import shutil

    copy = tmp_path / package_dir.name
    shutil.copytree(package_dir, copy)
    (copy / PATIENTS_FILE).write_bytes(b"{}\n")
    outcome = run_seed(_settings(package_dir=copy), check_only=True, persistence=RefusingWriter())
    assert _status(outcome, "package") == "failed"
    assert "checksum" in next(r.message for r in outcome.report.results if r.name == "package")


def test_load_persistence_validates_the_adapter(monkeypatch: pytest.MonkeyPatch) -> None:
    module = types.ModuleType("fake_backend_writer")
    module.factory = RefusingWriter  # type: ignore[attr-defined]
    module.instance = RefusingWriter()  # type: ignore[attr-defined]
    module.unrelated = object()  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "fake_backend_writer", module)
    assert isinstance(load_persistence("fake_backend_writer:factory"), RefusingWriter)
    assert isinstance(load_persistence("fake_backend_writer:instance"), RefusingWriter)
    for spec in (
        "fake_backend_writer",
        "fake_backend_writer:missing",
        "no_such_mod:x",
        "fake_backend_writer:unrelated",
    ):
        with pytest.raises(PatientDataError):
            load_persistence(spec)


def test_failing_adapter_contract_is_reported(package_dir: Path) -> None:
    class Broken(RefusingWriter):
        def target_contract(self) -> TargetContract:
            raise RuntimeError("boom")

    outcome = run_seed(_settings(package_dir=package_dir), check_only=True, persistence=Broken())
    assert _status(outcome, "backend.persistence") == "failed"


def test_contract_merge_keeps_both_sides_and_the_stricter_column() -> None:
    other = TargetContract(
        tables=(
            TargetTable(
                "patients",
                (
                    TargetColumn("source_patient_id", frozenset({"text"}), min_length=10),
                    TargetColumn("first_name", frozenset({"text"})),
                ),
            ),
        ),
        supported_revisions=frozenset({"abc"}),
    )
    merged = DATA_IMPORT_CONTRACT.merged(other)
    patients = next(t for t in merged.tables if t.name == "patients")
    columns = {c.name: c for c in patients.columns}
    assert {"seed_run_id", "source_lineage", "first_name"} <= set(columns)
    assert columns["source_patient_id"].min_length == 10
    assert merged.supported_revisions == frozenset({"abc"})
    assert merged.constraints == DATA_IMPORT_CONTRACT.constraints


@pytest.mark.parametrize(
    "column_type, family",
    [
        (postgresql.UUID(), "uuid"),
        (sqltypes.VARCHAR(40), "text"),
        (sqltypes.TEXT(), "text"),
        (postgresql.JSONB(), "jsonb"),
        (sqltypes.JSON(), "json"),
        (sqltypes.DATE(), "date"),
        (postgresql.TIMESTAMP(timezone=True), "timestamptz"),
        (postgresql.TIMESTAMP(timezone=False), "timestamp"),
        (sqltypes.BOOLEAN(), "boolean"),
        (sqltypes.BIGINT(), "integer"),
        (sqltypes.NUMERIC(18, 6), "numeric"),
    ],
)
def test_type_families(column_type: object, family: str) -> None:
    assert type_family(column_type) == family


def test_cli_check_only_reports_and_exits_nonzero(
    capsys: pytest.CaptureFixture[str], package_dir: Path
) -> None:
    assert seed.main(["--check-only", "--package-dir", str(package_dir)]) == 1
    output = capsys.readouterr().out
    assert "[ok     ] package:" in output
    assert "[BLOCKED] backend.persistence:" in output
    assert "seed status: not_ready" in output


def test_settings_come_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PATIENT_SEED_DATABASE_URL", "postgresql://u:p@h/db")
    monkeypatch.setenv("PATIENT_SEED_SCHEMA", "app")
    monkeypatch.setenv("PATIENT_SEED_WRITER", "backend.seed:writer")
    monkeypatch.setenv("PATIENT_SEED_LOCK_TIMEOUT_MS", "2500")
    settings = SeedSettings()
    assert settings.schema_name == "app" and settings.writer == "backend.seed:writer"
    assert settings.lock_timeout_ms == 2500
    assert settings.database_url is not None and "p@h" not in repr(settings)


def test_make_repo_fixture_is_usable(make_repo: MakeRepo) -> None:
    assert make_repo(name="x").source_file.is_file()
