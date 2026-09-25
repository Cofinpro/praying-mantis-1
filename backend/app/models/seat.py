from sqlalchemy import CheckConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import Client, enum_column


class Seat(Base):
    """A desk in the office. Each client's zone is its own small grid (see app/seed.py)."""

    __tablename__ = "seats"
    __table_args__ = (
        # Two seats can't sit in the same cell of a zone's grid
        UniqueConstraint("zone", "pos_x", "pos_y"),
        CheckConstraint("pos_x >= 0 AND pos_y >= 0", name="position_not_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(20), unique=True)  # e.g. "DKB-03"
    zone: Mapped[Client] = mapped_column(enum_column(Client))  # the same list as users.client
    # Grid position inside the zone, in cells (not pixels): column and row, from 0
    pos_x: Mapped[int]
    pos_y: Mapped[int]

    def __repr__(self) -> str:
        return f"<Seat {self.label}>"
