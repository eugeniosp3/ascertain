"""Patient summaries derived only from current clinical data (LLM prose or template)."""

from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import get_session
from app.dependencies import get_optional_user
from app.errors import error_responses
from app.models import User
from app.schemas.summaries import SummaryResponse
from app.services import summaries

router = APIRouter(tags=["Summaries"], responses=error_responses(401, 404, 422, 500, 503))


@router.get("/patients/{patient_id}/summary", response_model=SummaryResponse)
def get_summary(
    patient_id: UUID,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    _viewer: Annotated[User | None, Depends(get_optional_user)],
) -> SummaryResponse:
    settings = cast(Settings, request.app.state.settings)
    return summaries.summarize(session, patient_id, settings)
