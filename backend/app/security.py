from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.config import settings

# Argon2id with pwdlib's recommended parameters
password_hash = PasswordHash.recommended()

# Compared against when the email doesn't exist, so an unknown email takes as long
# as a wrong password and response times don't reveal which emails are registered
DUMMY_PASSWORD_HASH = password_hash.hash("dummy-password-for-timing")


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def create_access_token(user_id: int, expires_in: timedelta | None = None) -> str:
    """A signed JWT whose subject is the user id. Signed, not encrypted: anyone can read it."""
    now = datetime.now(UTC)
    if expires_in is None:
        expires_in = timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(user_id), "iat": now, "exp": now + expires_in}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> int:
    """Returns the user id. Raises jwt.InvalidTokenError if the token is bad or expired."""
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        # Pin the algorithm: never trust the "alg" in the token's own header
        algorithms=[settings.jwt_algorithm],
        options={"require": ["sub", "exp"]},
    )
    try:
        return int(payload["sub"])
    except ValueError as error:
        raise jwt.InvalidTokenError("sub is not a user id") from error
