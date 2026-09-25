from datetime import datetime

from sqlalchemy import ForeignKey, LargeBinary, String
from sqlalchemy.dialects.mysql import MEDIUMBLOB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enrollment import utc_now
from app.models.types import UtcDateTime

# MySQL's BLOB holds only 64 KB, so use MEDIUMBLOB (16 MB). The API caps uploads far below that
# (services/avatars.py). with_variant keeps a portable LargeBinary for any other database.
AvatarBytes = LargeBinary().with_variant(MEDIUMBLOB(), "mysql")


class UserAvatar(Base):
    """A user's profile picture, stored in the database.

    Render's disk is wiped on every deploy, so files can't live next to the app. At a few KB each
    (the frontend shrinks them to 256 px), a table is the simplest store that survives.
    """

    __tablename__ = "user_avatars"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    content_type: Mapped[str] = mapped_column(String(32))
    # deferred: loading the row (e.g. for its updated_at in /me) doesn't pull the image bytes along
    data: Mapped[bytes] = mapped_column(AvatarBytes, deferred=True)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now, onupdate=utc_now)
