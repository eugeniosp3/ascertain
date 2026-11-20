"""Dashboard HTTP boundary; all totals and previews come from PostgreSQL."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_session
from app.dependencies import get_optional_user
from app.models import User
from app.schemas.dashboard import DashboardOverview
from app.services.dashboard import get_overview

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/overview", response_model=DashboardOverview)
def overview(
    session: Annotated[Session, Depends(get_session)],
    _actor: Annotated[User | None, Depends(get_optional_user)],
) -> DashboardOverview:
    """Return global patients/active/inactive/clinical_notes/no_visit totals.

    recent_visits and no_visit_patients each contain up to six patients, independently
    of the totals. Visits sort newest first, missing visits sort by patient name, and
    UUID makes each order stable. Clinical-note counts exclude deleted notes.
    """
    return get_overview(session)
