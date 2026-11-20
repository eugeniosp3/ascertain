"""Compose the API and own resource lifetime; keep domain operations in services."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings
from app.db import build_engine
from app.errors import register_exception_handlers
from app.routers import (
    comments,
    dashboard,
    health,
    notes,
    notifications,
    patients,
    summaries,
    users,
)
from app.utils.logging import configure_exception_logging


def create_app(settings: Settings | None = None) -> CORSMiddleware:
    """Assemble the API, its app-owned resources, and an outer CORS boundary."""
    config = settings if settings is not None else Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = build_engine(config)
        app.state.engine = engine
        try:
            yield
        finally:
            if engine is not None:
                engine.dispose()
            app.state.engine = None

    app = FastAPI(title=config.app_name, lifespan=lifespan)
    app.state.engine = None
    app.state.settings = config
    configure_exception_logging()
    register_exception_handlers(app)
    app.include_router(health.router)
    app.include_router(patients.router)
    app.include_router(dashboard.router)
    app.include_router(users.router)
    app.include_router(notes.router)
    app.include_router(comments.router)
    app.include_router(summaries.router)
    app.include_router(notifications.router)
    # Wrapping the whole app includes framework-generated 500s in CORS handling.
    return CORSMiddleware(
        app,
        allow_origins=list(config.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "X-Demo-User-ID"],
    )
