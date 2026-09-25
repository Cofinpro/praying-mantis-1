from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, SmallInteger, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enrollment import utc_now
from app.models.training import Training
from app.models.types import UtcDateTime
from app.models.user import User


class TrainingFeedback(Base):
    """One person's rating (1-5) and optional comment for a training they completed."""

    __tablename__ = "training_feedback"
    __table_args__ = (
        # One per person and training: rating again edits it
        UniqueConstraint("training_id", "user_id"),
        # The API checks it too; the database is the last line of defence
        CheckConstraint("rating BETWEEN 1 AND 5", name="rating_1_to_5"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    training_id: Mapped[int] = mapped_column(ForeignKey("trainings.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    rating: Mapped[int] = mapped_column(SmallInteger)
    comment: Mapped[str | None] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now, onupdate=utc_now)

    training: Mapped[Training] = relationship()
    user: Mapped[User] = relationship()
