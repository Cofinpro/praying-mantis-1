from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import NotificationType


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: NotificationType
    message: str
    link: str | None
    read: bool
    created_at: datetime


class NotificationList(BaseModel):
    """GET /api/notifications. unread_count covers all of them, not just the listed ones."""

    unread_count: int
    items: list[NotificationRead]
