"""Exercise the actual migration in an isolated schema of the disposable test database."""

from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.exc import IntegrityError


def test_initial_migration_round_trip_and_metadata_match(
    pg_engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    schema = f"migration_test_{uuid4().hex}"
    with pg_engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    target = pg_engine.url.update_query_dict({"options": f"-csearch_path={schema}"})
    monkeypatch.setenv("DATABASE_URL", target.render_as_string(hide_password=False))
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    check_engine = create_engine(target)
    try:
        command.upgrade(config, "20261120_0001")
        patient_id, user_id = uuid4(), uuid4()
        with check_engine.begin() as connection:
            connection.execute(
                text("INSERT INTO users (id, display_name) VALUES (:id, 'Migration actor')"),
                {"id": user_id},
            )
            connection.execute(
                text(
                    "INSERT INTO patients (id, first_name, last_name, date_of_birth) "
                    "VALUES (:id, 'Synthetic', 'Migration', '1980-01-01')"
                ),
                {"id": patient_id},
            )
            before = connection.execute(text("SELECT to_jsonb(p) FROM patients p")).scalar_one()
        command.upgrade(config, "head")
        command.check(config)
        with check_engine.begin() as connection:
            assert inspect(connection).has_table("patients", schema=schema)
            after = connection.execute(text("SELECT to_jsonb(p) FROM patients p")).scalar_one()
            assert after.pop("assigned_user_id") is None
            assert after == before
            assert any(
                index["name"] == "ix_patients_assigned_user_id"
                and index["column_names"] == ["assigned_user_id", "id"]
                for index in inspect(connection).get_indexes("patients", schema=schema)
            )
            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(
                    text("UPDATE patients SET assigned_user_id = :id"), {"id": uuid4()}
                )
            connection.execute(text("UPDATE patients SET assigned_user_id = :id"), {"id": user_id})
            assert (
                connection.execute(text("SELECT assigned_user_id FROM patients")).scalar_one()
                == user_id
            )
            connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
            assert (
                connection.execute(text("SELECT assigned_user_id FROM patients")).scalar_one()
                is None
            )
        command.downgrade(config, "20261120_0001")
        with check_engine.connect() as connection:
            assert (
                connection.execute(text("SELECT to_jsonb(p) FROM patients p")).scalar_one()
                == before
            )
        command.upgrade(config, "head")
        command.check(config)
        command.downgrade(config, "base")
        with check_engine.connect() as connection:
            assert not inspect(connection).has_table("patients", schema=schema)
    finally:
        check_engine.dispose()
        with pg_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))


def test_patient_summaries_migration_round_trip(
    pg_engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    schema = f"migration_test_{uuid4().hex}"
    with pg_engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    target = pg_engine.url.update_query_dict({"options": f"-csearch_path={schema}"})
    monkeypatch.setenv("DATABASE_URL", target.render_as_string(hide_password=False))
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    check_engine = create_engine(target)
    add_patient = text(
        "INSERT INTO patients (id, first_name, last_name, date_of_birth) "
        "VALUES (:id, 'Synthetic', 'Summary', '1980-01-01')"
    )
    add_summary = text(
        "INSERT INTO patient_summaries (patient_id, summary, method, model, facts_hash, "
        "generated_at) VALUES (:id, 'Narrative.', :method, 'test-model', :hash, now())"
    )
    read_patient = text("SELECT to_jsonb(p) FROM patients p WHERE id = :id")
    try:
        command.upgrade(config, "20261120_0002")
        kept, doomed = uuid4(), uuid4()
        with check_engine.begin() as connection:
            connection.execute(add_patient, [{"id": kept}, {"id": doomed}])
            before = connection.execute(read_patient, {"id": kept}).scalar_one()
        command.upgrade(config, "20261120_0003")
        command.check(config)
        with check_engine.begin() as connection:
            columns = inspect(connection).get_columns("patient_summaries", schema=schema)
            assert [column["name"] for column in columns] == [
                "patient_id",
                "summary",
                "method",
                "model",
                "facts_hash",
                "generated_at",
            ]
            assert [column["name"] for column in columns if column["nullable"]] == ["model"]
            for bad in (
                {"id": kept, "method": "template", "hash": "0" * 64},  # CHECK method IN ('llm')
                {"id": uuid4(), "method": "llm", "hash": "0" * 64},  # FK to patients
            ):
                with pytest.raises(IntegrityError), connection.begin_nested():
                    connection.execute(add_summary, bad)
            connection.execute(
                add_summary,
                [
                    {"id": kept, "method": "llm", "hash": "a" * 64},
                    {"id": doomed, "method": "llm", "hash": "b" * 64},
                ],
            )
            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(add_summary, {"id": kept, "method": "llm", "hash": "c" * 64})
            connection.execute(text("DELETE FROM patients WHERE id = :id"), {"id": doomed})
            remaining = connection.execute(text("SELECT patient_id FROM patient_summaries"))
            assert remaining.scalars().all() == [kept]
        command.downgrade(config, "20261120_0002")
        with check_engine.connect() as connection:
            assert not inspect(connection).has_table("patient_summaries", schema=schema)
            assert connection.execute(read_patient, {"id": kept}).scalar_one() == before
        command.upgrade(config, "head")
        command.check(config)
    finally:
        check_engine.dispose()
        with pg_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
