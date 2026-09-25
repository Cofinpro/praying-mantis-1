from datetime import UTC, datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import EnrollmentStatus, enum_column
from app.models.training import Training
from app.models.types import UtcDateTime
from app.models.user import User


def utc_now() -> datetime:
    return datetime.now(UTC)


class Enrollment(Base):
    """A user's request for a seat in a training, and what became of it."""

    __tablename__ = "enrollments"
    __table_args__ = (
        # One row per person and training: re-requesting after a withdrawal reuses it
        UniqueConstraint("training_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    training_id: Mapped[int] = mapped_column(ForeignKey("trainings.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[EnrollmentStatus] = mapped_column(
        enum_column(EnrollmentStatus), default=EnrollmentStatus.PENDING
    )
    decision_comment: Mapped[str | None] = mapped_column(String(500))
    requested_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)
    # Column "decided_by" (plan.md §4.3). If the decider is deleted, the decision stays.
    decided_by_id: Mapped[int | None] = mapped_column(
        "decided_by", ForeignKey("users.id", ondelete="SET NULL")
    )
    decided_at: Mapped[datetime | None] = mapped_column(UtcDateTime)

    training: Mapped[Training] = relationship()
    user: Mapped[User] = relationship(foreign_keys=[user_id])
    decided_by: Mapped[User | None] = relationship(foreign_keys=[decided_by_id])

    def __repr__(self) -> str:
        return f"<Enrollment {self.id} training={self.training_id} user={self.user_id} {self.status}>"
