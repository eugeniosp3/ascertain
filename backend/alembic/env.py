"""Migration entry point; target metadata comes from the reviewed ORM models."""

from alembic import context

import app.models  # noqa: F401  Registers every application table on Base.metadata.
from app.config import Settings
from app.db import Base, build_engine

target_metadata = Base.metadata


def run_migrations() -> None:
    """Run reviewed revisions from alembic/versions against DATABASE_URL."""
    if not target_metadata.tables:
        raise RuntimeError(
            "No ORM tables are registered; app.models must import successfully. "
            "No migration or database write was attempted."
        )

    settings = Settings()
    if settings.database_url is None:
        raise RuntimeError("DATABASE_URL is required to run migrations.")

    if context.is_offline_mode():
        context.configure(
            url=settings.database_url.get_secret_value(),
            target_metadata=target_metadata,
            literal_binds=True,
            dialect_opts={"paramstyle": "named"},
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()
        return

    engine = build_engine(settings)
    assert engine is not None
    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
                compare_server_default=True,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


run_migrations()
