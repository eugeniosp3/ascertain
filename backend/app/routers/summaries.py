"""Patient summaries derived only from current clinical data."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_session
from app.dependencies import get_optional_user
from app.models import User
from app.schemas.summaries import SummaryResponse
from app.services import summaries

router = APIRouter(tags=["Summaries"])


@router.get("/patients/{patient_id}/summary", response_model=SummaryResponse)
def get_summary(
    patient_id: UUID,
    session: Annotated[Session, Depends(get_session)],
    _viewer: Annotated[User | None, Depends(get_optional_user)],
) -> SummaryResponse:
    return summaries.get_summary(session, patient_id)
