from typing import Annotated

from fastapi import APIRouter, Query

from app.dependencies import AdminUser, DbSession
from app.schemas.user import UserSummary
from app.services.users import search_users

router = APIRouter(prefix="/users", tags=["users"])


@router.get(
    "",
    responses={
        401: {"description": "Missing, invalid or expired token"},
        403: {"description": "Admins only"},
    },
)
def list_users(
    db: DbSession,
    _admin: AdminUser,
    search: Annotated[
        str | None, Query(max_length=100, description="Part of a name or email")
    ] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[UserSummary]:
    """Admin only. For the trainer picker when creating a training."""
    return [UserSummary.model_validate(user) for user in search_users(db, search, limit)]
