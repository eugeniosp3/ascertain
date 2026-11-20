"""Read the selectable synthetic users without exposing private account fields."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User
from app.schemas.users import UserResponse


def list_users(session: Session) -> list[UserResponse]:
    """Read active identities in a deterministic display order; perform no writes."""
    users = session.scalars(
        select(User).where(User.is_active.is_(True)).order_by(User.display_name, User.id)
    ).all()
    return [UserResponse.model_validate(user) for user in users]
