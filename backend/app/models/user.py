from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, false, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import Client, Level, enum_column

if TYPE_CHECKING:
    from app.models.avatar import UserAvatar


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    client: Mapped[Client] = mapped_column(enum_column(Client))
    level: Mapped[Level] = mapped_column(enum_column(Level))
    is_admin: Mapped[bool] = mapped_column(default=False, server_default=false())
    # HR: gives the second approval of expenses (services/expenses.py)
    is_hr: Mapped[bool] = mapped_column(default=False, server_default=false())
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

    # One-to-one; only the small columns load (UserAvatar.data is deferred)
    avatar: Mapped["UserAvatar | None"] = relationship(cascade="all, delete-orphan", passive_deletes=True)

    @property
    def avatar_url(self) -> str | None:
        """Where the picture is served. ?v= changes with every upload, so browsers can cache it forever."""
        if self.avatar is None:
            return None
        return f"/api/users/{self.id}/avatar?v={int(self.avatar.updated_at.timestamp())}"

    @property
    def is_team_lead(self) -> bool:
        """Derived, not stored: someone has this user as their team lead."""
        return len(self.reports) > 0

    def __repr__(self) -> str:
        return f"<User {self.id} {self.email}>"
