"""Read-only operations used by the database connectivity endpoint."""

from sqlalchemy import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.errors import AppError
from app.utils.database_checks import DatabaseChecks


def ensure_database_available(engine: Engine) -> None:
    """Open and close one connection; never expose driver errors or mutate the database."""
    try:
        with engine.connect() as connection:
            available = DatabaseChecks(connection).connectivity().passed
    except SQLAlchemyError:
        available = False
    if not available:
        raise AppError(
            status_code=503,
            code="database_unavailable",
            message="The database is not reachable.",
        )
