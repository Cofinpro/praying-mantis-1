from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enrollment import utc_now
from app.models.seat import Seat
from app.models.types import UtcDateTime
from app.models.user import User


class SeatReservation(Base):
    """A person on a seat for one day. The two UNIQUE constraints are the rules."""

    __tablename__ = "seat_reservations"
    __table_args__ = (
        UniqueConstraint("seat_id", "date"),  # one person per seat per day
        UniqueConstraint("user_id", "date"),  # one seat per person per day (Q3)
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    seat_id: Mapped[int] = mapped_column(ForeignKey("seats.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)
    # When the "your seat tomorrow" reminder went out (services/reminders.py); NULL = not yet
    reminded_at: Mapped[datetime | None] = mapped_column(UtcDateTime)

    seat: Mapped[Seat] = relationship()
    user: Mapped[User] = relationship()

    def __repr__(self) -> str:
        return f"<SeatReservation {self.seat_id} {self.date} user={self.user_id}>"
