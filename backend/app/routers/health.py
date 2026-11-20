"""Liveness and database connectivity endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import Engine

from app.db import get_engine
from app.schemas.common import ErrorResponse
from app.schemas.health import HealthResponse, ReadyResponse
from app.services.readiness import ensure_database_available

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Confirm the API process responds without requiring a database connection."""
    return HealthResponse()


@router.get(
    "/ready",
    response_model=ReadyResponse,
    responses={503: {"model": ErrorResponse, "description": "Database unavailable"}},
)
def ready(engine: Annotated[Engine, Depends(get_engine)]) -> ReadyResponse:
    """Check database connectivity only; full schema/seed preflight is separate."""
    ensure_database_available(engine)
    return ReadyResponse()
