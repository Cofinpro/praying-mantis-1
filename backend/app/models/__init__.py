"""SQLAlchemy models (the database shape).

Import every model here, so Alembic sees all tables through Base.metadata.
"""

from app.database import Base
from app.models.avatar import UserAvatar
from app.models.enrollment import Enrollment
from app.models.feedback import TrainingFeedback
from app.models.material import TrainingMaterial
from app.models.enums import Client, EnrollmentStatus, ExpenseCategory, ExpenseStatus, Level, NotificationType
from app.models.expense import Expense, ExpenseReceipt
from app.models.notification import Notification
from app.models.reservation import SeatReservation
from app.models.seat import Seat
from app.models.training import Training, TrainingLevel
from app.models.user import User

__all__ = [
    "Base",
    "Client",
    "Enrollment",
    "EnrollmentStatus",
    "Expense",
    "ExpenseCategory",
    "ExpenseReceipt",
    "ExpenseStatus",
    "Level",
    "Notification",
    "NotificationType",
    "Seat",
    "SeatReservation",
    "Training",
    "TrainingFeedback",
    "TrainingLevel",
    "TrainingMaterial",
    "User",
    "UserAvatar",
]
