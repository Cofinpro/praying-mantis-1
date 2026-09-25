from datetime import datetime

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enrollment import utc_now
from app.models.enums import NotificationType, enum_column
from app.models.types import UtcDateTime


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        # The bell's query: my notifications, newest first
        Index("ix_notifications_user_id_created_at", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[NotificationType] = mapped_column(enum_column(NotificationType))
    message: Mapped[str] = mapped_column(String(500))
    # Where clicking it goes in the FE, e.g. "/trainings/12" or "/approvals"
    link: Mapped[str | None] = mapped_column(String(200))
    read_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)

    @property
    def read(self) -> bool:
        return self.read_at is not None
