from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User
from app.security import DUMMY_PASSWORD_HASH, verify_password


def authenticate(db: Session, email: str, password: str) -> User | None:
    """The user with this email and password, or None. Never says which one was wrong."""
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        # Burn the same time as a real check (see DUMMY_PASSWORD_HASH)
        verify_password(password, DUMMY_PASSWORD_HASH)
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user
