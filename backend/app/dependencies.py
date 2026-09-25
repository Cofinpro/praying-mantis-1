"""Dependencies shared by many routers."""

from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import decode_access_token

# Reads "Authorization: Bearer <token>" and adds the "Authorize" button to /docs.
# auto_error=False so we return our own 401 (with WWW-Authenticate) instead of FastAPI's.
bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    """The logged-in user. Any endpoint that takes a CurrentUser parameter requires a valid token."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        user_id = decode_access_token(credentials.credentials)
    except jwt.InvalidTokenError:
        raise unauthorized from None

    user = db.get(User, user_id)
    if user is None:  # token is valid, but the user was deleted since
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
