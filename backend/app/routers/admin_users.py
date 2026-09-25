from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.dependencies import AdminUser, CurrentUser, DbSession
from app.schemas.user import PasswordChange, PasswordReset, UserAdminRead, UserCreate, UserUpdate
from app.services import users as service

router = APIRouter(prefix="/admin/users", tags=["admin: users"])

ADMIN_ONLY = {401: {"description": "Missing, invalid or expired token"}, 403: {"description": "Admins only"}}


@router.get("", responses=ADMIN_ONLY)
def list_users(
    db: DbSession, _admin: AdminUser, search: Annotated[str | None, Query(max_length=100)] = None
) -> list[UserAdminRead]:
    """Every user, sorted by name, for the admin Users page."""
    return [UserAdminRead.model_validate(u) for u in service.list_users(db, search)]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    responses=ADMIN_ONLY | {409: {"description": "email_taken"}, 422: {"description": "team_lead_not_found | team_lead_cycle"}},
)
def create_user(body: UserCreate, db: DbSession, _admin: AdminUser) -> UserAdminRead:
    return UserAdminRead.model_validate(service.create_user(db, body))


@router.get("/{user_id}", responses=ADMIN_ONLY | {404: {"description": "User not found"}})
def get_user(user_id: int, db: DbSession, _admin: AdminUser) -> UserAdminRead:
    return UserAdminRead.model_validate(service.get_user(db, user_id))


@router.patch(
    "/{user_id}",
    responses=ADMIN_ONLY
    | {404: {"description": "User not found"}, 409: {"description": "email_taken | cannot_demote_self"}},
)
def update_user(user_id: int, body: UserUpdate, db: DbSession, admin: AdminUser) -> UserAdminRead:
    """Send only what changes. team_lead_id: null removes the lead."""
    return UserAdminRead.model_validate(service.update_user(db, user_id, body, acting_admin=admin))


@router.post(
    "/{user_id}/password",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=ADMIN_ONLY | {404: {"description": "User not found"}},
)
def reset_password(user_id: int, body: PasswordReset, db: DbSession, _admin: AdminUser) -> Response:
    """Set a new password for someone (e.g. they forgot theirs). Tell them out of band."""
    service.reset_password(db, user_id, body.password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Mounted at /api/me: my own account
me_router = APIRouter(prefix="/me", tags=["account"])


@me_router.post(
    "/password",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={401: {"description": "Missing, invalid or expired token"}, 422: {"description": "wrong_password | same_password"}},
)
def change_password(body: PasswordChange, db: DbSession, user: CurrentUser) -> Response:
    """Change my password. Existing tokens stay valid until they expire (8 h)."""
    service.change_own_password(db, user, body)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
