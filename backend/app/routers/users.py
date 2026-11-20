"""Demo identity selection."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_session
from app.dependencies import get_optional_user
from app.errors import error_responses
from app.models import User
from app.schemas.users import UserResponse
from app.services import users

router = APIRouter(tags=["Users"], responses=error_responses(401, 422, 500, 503))


@router.get("/users", response_model=list[UserResponse])
def list_users(
    session: Annotated[Session, Depends(get_session)],
    _viewer: Annotated[User | None, Depends(get_optional_user)],
) -> list[UserResponse]:
    return users.list_users(session)
