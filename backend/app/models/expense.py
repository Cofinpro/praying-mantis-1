from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.avatar import AvatarBytes
from app.models.enrollment import utc_now
from app.models.enums import ExpenseCategory, ExpenseStatus, enum_column
from app.models.types import UtcDateTime
from app.models.user import User


class Expense(Base):
    """Money someone spent for work and wants back. Approved by their team lead, then by HR."""

    __tablename__ = "expenses"
    __table_args__ = (CheckConstraint("amount > 0", name="amount_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(String(1000))
    category: Mapped[ExpenseCategory] = mapped_column(enum_column(ExpenseCategory))
    # DECIMAL(10, 2), read as Python's Decimal: money is never a float (0.1 + 0.2 != 0.3)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    spent_on: Mapped[date] = mapped_column(Date)
    status: Mapped[ExpenseStatus] = mapped_column(enum_column(ExpenseStatus), index=True)
    submitted_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)
    # The two decisions. If a decider's account is deleted, the decision stays.
    lead_decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    lead_decided_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    hr_decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    hr_decided_at: Mapped[datetime | None] = mapped_column(UtcDateTime)
    rejection_reason: Mapped[str | None] = mapped_column(String(500))

    user: Mapped[User] = relationship(foreign_keys=[user_id])
    lead_decided_by: Mapped[User | None] = relationship(foreign_keys=[lead_decided_by_id])
    hr_decided_by: Mapped[User | None] = relationship(foreign_keys=[hr_decided_by_id])
    # Loaded with one extra IN query for a whole list (their bytes are deferred)
    receipts: Mapped[list["ExpenseReceipt"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="ExpenseReceipt.id"
    )

    def __repr__(self) -> str:
        return f"<Expense {self.id} {self.amount} {self.currency} user={self.user_id} {self.status}>"


class ExpenseReceipt(Base):
    """A photo or PDF of a receipt, stored like training materials (a deferred MEDIUMBLOB)."""

    __tablename__ = "expense_receipts"

    id: Mapped[int] = mapped_column(primary_key=True)
    expense_id: Mapped[int] = mapped_column(ForeignKey("expenses.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int]
    data: Mapped[bytes] = mapped_column(AvatarBytes, deferred=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=utc_now)
