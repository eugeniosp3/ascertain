"""Dashboard HTTP boundary; all totals and previews come from PostgreSQL."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_session
from app.dependencies import get_current_user, get_optional_user
from app.errors import error_responses
from app.models import User
from app.schemas.common import ErrorResponse
from app.schemas.dashboard import DashboardOverview, DashboardScope
from app.services.dashboard import get_overview

router = APIRouter(
    prefix="/dashboard", tags=["Dashboard"], responses=error_responses(401, 422, 500, 503)
)


@router.get(
    "/overview",
    response_model=DashboardOverview,
    responses={
        401: {"model": ErrorResponse, "description": "Demo user required for assigned scope"}
    },
)
def overview(
    session: Annotated[Session, Depends(get_session)],
    actor: Annotated[User | None, Depends(get_optional_user)],
    scope: Annotated[
        DashboardScope,
        Query(
            description=(
                "`global` (default) spans all patients; `assigned` spans the patients "
                "assigned to the selected X-Demo-User-ID."
            )
        ),
    ] = "global",
) -> DashboardOverview:
    """Return patients/active/inactive/clinical_notes/no_visit totals for one cohort.

    recent_visits and no_visit_patients each contain up to six patients, independently
    of the totals. Visits sort newest first, missing visits sort by patient name, and
    UUID makes each order stable. Clinical-note counts exclude deleted notes.
    scope=assigned requires a selected demo user and uses that user's assignments
    for every total and preview. Global scope includes all patients by default.
    """
    if scope == "assigned":
        actor = get_current_user(actor)
    return get_overview(session, scope, actor)
