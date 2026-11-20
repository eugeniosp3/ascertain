"""Exercise the actual migration in an isolated schema of the disposable test database."""

from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, inspect, text


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
        command.upgrade(config, "head")
        command.check(config)
        with check_engine.connect() as connection:
            assert inspect(connection).has_table("patients", schema=schema)
        command.downgrade(config, "base")
        with check_engine.connect() as connection:
            assert not inspect(connection).has_table("patients", schema=schema)
    finally:
        check_engine.dispose()
        with pg_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
