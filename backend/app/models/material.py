from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.avatar import AvatarBytes
from app.models.enrollment import utc_now
from app.models.types import UtcDateTime
from app.models.user import User


class TrainingMaterial(Base):
    """A file for a training (slides, exercises…), stored in the database like avatars are:
    Render's disk is wiped on every deploy. MEDIUMBLOB holds up to 16 MB; the API caps uploads at 10 MB."""

    __tablename__ = "training_materials"

    id: Mapped[int] = mapped_column(primary_key=True)
    training_id: Mapped[int] = mapped_column(ForeignKey("trainings.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    # Decided by the API from the file's extension and first bytes, never taken from the client
    content_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int]
    # deferred: listing materials doesn't read the files themselves
    data: Mapped[bytes] = mapped_column(AvatarBytes, deferred=True)
    # If the uploader's account is deleted, the file stays
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)

    uploaded_by: Mapped[User | None] = relationship()

    def __repr__(self) -> str:
        return f"<TrainingMaterial {self.id} {self.filename!r} training={self.training_id}>"
