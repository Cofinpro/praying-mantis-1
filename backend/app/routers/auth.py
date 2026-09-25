from fastapi import APIRouter, HTTPException, status

from app.dependencies import CurrentUser, DbSession
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import CurrentUserRead
from app.security import create_access_token
from app.services.auth import authenticate

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/login",
    responses={401: {"description": "Invalid email or password"}},
)
def login(body: LoginRequest, db: DbSession) -> TokenResponse:
    user = authenticate(db, body.email, body.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    return TokenResponse(access_token=create_access_token(user.id))


@router.get(
    "/me",
    responses={401: {"description": "Missing, invalid or expired token"}},
)
def me(user: CurrentUser) -> CurrentUserRead:
    return CurrentUserRead.model_validate(user)
