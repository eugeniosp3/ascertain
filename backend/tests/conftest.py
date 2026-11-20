"""Isolated settings and PostgreSQL sessions for endpoint integration tests."""

import os
from collections.abc import Iterator
from pathlib import Path
from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, inspect
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import get_session
from app.main import create_app


@pytest.fixture
def settings(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Settings:
    monkeypatch.chdir(tmp_path)
    for name in Settings.model_fields:
        monkeypatch.delenv(name.upper(), raising=False)
    return Settings(
        app_env="test",
        database_url=None,
        demo_mode=True,
        cors_origins=("http://localhost:5173",),
        summary_provider="template",  # Tests never call the summary LLM unless they opt in.
    )


@pytest.fixture(scope="session")
def pg_engine() -> Iterator[Engine]:
    url = os.environ.get("TEST_DATABASE_URL")
    if url is None:
        pytest.skip("Set TEST_DATABASE_URL to a migrated, disposable PostgreSQL *_tests database.")
    target = make_url(url)
    if target.get_backend_name() != "postgresql" or not (target.database or "").endswith("_tests"):
        pytest.fail("Integration tests require an explicitly named PostgreSQL *_tests database.")
    engine = create_engine(url, hide_parameters=True)
    with engine.connect() as connection:
        if not inspect(connection).has_table("patients"):
            pytest.fail("Apply Alembic migrations to TEST_DATABASE_URL before integration tests.")
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def db_session(pg_engine: Engine) -> Iterator[Session]:
    """Service commits release savepoints; the outer test transaction always rolls back."""
    with pg_engine.connect() as connection:
        transaction = connection.begin()
        with Session(
            bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        ) as session:
            try:
                yield session
            finally:
                session.close()
                transaction.rollback()


@pytest.fixture
def api_client(settings: Settings, db_session: Session) -> Iterator[TestClient]:
    application = create_app(settings)
    api = cast(FastAPI, application.app)

    def use_test_session() -> Iterator[Session]:
        yield db_session

    api.dependency_overrides[get_session] = use_test_session
    with TestClient(application, raise_server_exceptions=False) as client:
        yield client


@pytest.fixture
def demo_users(db_session: Session):
    from app.models import User

    users = (
        User(display_name="Demo User 1", display_role="Reviewer", is_active=True),
        User(display_name="Demo User 2", display_role="Coordinator", is_active=True),
    )
    db_session.add_all(users)
    db_session.commit()
    return users
