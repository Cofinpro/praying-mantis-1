from datetime import datetime

from sqlalchemy import ForeignKey, String, false, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import Client, Level, enum_column


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    client: Mapped[Client] = mapped_column(enum_column(Client))
    level: Mapped[Level] = mapped_column(enum_column(Level))
    is_admin: Mapped[bool] = mapped_column(default=False, server_default=false())
    # If the lead is deleted, their reports just lose their lead
    team_lead_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # The user this person reports to
    team_lead: Mapped["User | None"] = relationship(
        remote_side=[id], back_populates="reports"
    )
    # The users who report to this person. passive_deletes: let the database's
    # ON DELETE SET NULL handle them instead of SQLAlchemy loading and updating each one.
    reports: Mapped[list["User"]] = relationship(
        back_populates="team_lead", passive_deletes=True
    )

    @property
    def is_team_lead(self) -> bool:
        """Derived, not stored: someone has this user as their team lead."""
        return len(self.reports) > 0

    def __repr__(self) -> str:
        return f"<User {self.id} {self.email}>"
