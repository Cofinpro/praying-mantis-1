"""Profile pictures: validate, store and read them. No HTTP here (see routers/avatars.py)."""

from sqlalchemy.orm import Session

from app.errors import NotFound, ValidationFailed
from app.models import User, UserAvatar

# The frontend sends a 256 px JPEG of about 10-40 KB. The cap leaves room for other clients.
MAX_BYTES = 512 * 1024

# The first bytes of each allowed format. Checking them (not just the Content-Type the client
# claims) means only real images are stored and served back.
SIGNATURES = {
    "image/jpeg": lambda b: b.startswith(b"\xff\xd8\xff"),
    "image/png": lambda b: b.startswith(b"\x89PNG\r\n\x1a\n"),
    "image/webp": lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP",
}


def set_avatar(db: Session, user: User, data: bytes, content_type: str | None) -> User:
    if content_type not in SIGNATURES:
        raise ValidationFailed("file", "Use a JPEG, PNG or WebP image", "avatar_type", content_type)
    if len(data) > MAX_BYTES:
        raise ValidationFailed("file", "The image is too large (max 512 KB)", "avatar_too_large", len(data))
    if not SIGNATURES[content_type](data):
        raise ValidationFailed("file", "The file isn't a valid image", "avatar_not_image", content_type)

    avatar = user.avatar or UserAvatar(user_id=user.id)
    avatar.content_type = content_type
    avatar.data = data
    user.avatar = avatar
    db.commit()
    db.refresh(user)
    return user


def remove_avatar(db: Session, user: User) -> None:
    if user.avatar is not None:
        user.avatar = None  # delete-orphan removes the row
        db.commit()


def get_avatar(db: Session, user_id: int) -> UserAvatar:
    avatar = db.get(UserAvatar, user_id)
    if avatar is None:
        raise NotFound("No profile picture")
    return avatar
