"""Database resources and session boundaries; this module never mutates schema or data."""

from collections.abc import Iterator
from typing import Annotated, cast

from fastapi import Depends, Request
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session

from app.config import Settings
from app.errors import AppError


class Base(DeclarativeBase):
    """Shared ORM metadata; app.models registers the reviewed patient application tables."""


def build_engine(settings: Settings) -> Engine | None:
    """Build a lazy connection pool; no connection is opened until it is used."""
    if settings.database_url is None:
        return None
    return create_engine(
        settings.database_url.get_secret_value(),
        pool_pre_ping=True,
        hide_parameters=True,
        connect_args={"connect_timeout": settings.db_connect_timeout_seconds},
    )


def get_engine(request: Request) -> Engine:
    """Resolve the app-owned engine without creating a new pool for each request."""
    engine = cast(Engine | None, request.app.state.engine)
    if engine is None:
        raise AppError(
            status_code=503,
            code="database_not_configured",
            message="Database configuration is not available.",
        )
    return engine


def get_session(engine: Annotated[Engine, Depends(get_engine)]) -> Iterator[Session]:
    """Close the request session and roll back uncommitted work; services own commits."""
    with Session(engine, expire_on_commit=False) as session:
        yield session
