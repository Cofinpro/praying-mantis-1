from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, Text, func
from sqlalchemy.ext.associationproxy import AssociationProxy, association_proxy
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import Level, enum_column
from app.models.types import UtcDateTime
from app.models.user import User


class TrainingLevel(Base):
    """Join table: which levels a training is for (a training can target several)."""

    __tablename__ = "training_levels"

    training_id: Mapped[int] = mapped_column(
        ForeignKey("trainings.id", ondelete="CASCADE"), primary_key=True
    )
    level: Mapped[Level] = mapped_column(enum_column(Level), primary_key=True)


class Training(Base):
    __tablename__ = "trainings"
    __table_args__ = (
        # The API validates these too; the database is the last line of defence
        CheckConstraint("max_seats > 0", name="max_seats_positive"),
        CheckConstraint("ends_at > starts_at", name="ends_after_start"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    starts_at: Mapped[datetime] = mapped_column(UtcDateTime)
    ends_at: Mapped[datetime] = mapped_column(UtcDateTime)
    max_seats: Mapped[int]
    # NULL means an External trainer. RESTRICT (the default): a user who trains
    # can't be deleted, instead of their trainings silently turning "External".
    trainer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    external_trainer_name: Mapped[str | None] = mapped_column(String(100))
    # Column "created_by" (plan.md §4.3); the attribute ends in _id so that
    # .created_by can be the User object
    created_by_id: Mapped[int] = mapped_column("created_by", ForeignKey("users.id"), index=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    trainer: Mapped[User | None] = relationship(foreign_keys=[trainer_id])
    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id])

    # The join-table rows. Removing a level from the list deletes its row.
    level_links: Mapped[list[TrainingLevel]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, lazy="selectin"
    )
    # training.levels reads and writes plain Level values through the join table:
    # training.levels = [Level.JUNIOR] creates the TrainingLevel row for you
    levels: AssociationProxy[list[Level]] = association_proxy(
        "level_links", "level", creator=lambda level: TrainingLevel(level=level)
    )

    @property
    def cancelled(self) -> bool:
        return self.cancelled_at is not None

    def __repr__(self) -> str:
        return f"<Training {self.id} {self.name!r}>"
