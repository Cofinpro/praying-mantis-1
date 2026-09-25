from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import UploadFile
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models import ExpenseCategory, ExpenseStatus

# Euros with cents. Pydantic reads "12.50" (form fields are text) into a Decimal, and writes it back
# to JSON as the string "12.50": a JSON number would be read as a float by JavaScript.
Money = Annotated[Decimal, Field(gt=0, le=Decimal("10000"), max_digits=10, decimal_places=2)]


class ExpenseCreate(BaseModel):
    """POST /api/expenses, as multipart/form-data: these fields plus 1-5 files named `receipts`."""

    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] = ""
    category: ExpenseCategory
    amount: Money
    spent_on: date  # the day on the receipt, YYYY-MM-DD
    receipts: list[UploadFile] = Field(description="1-5 files: PDF, PNG, JPEG or WebP, max 5 MB each")


class ExpenseReject(BaseModel):
    """Rejecting always says why: the submitter sees the reason."""

    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class PersonRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    avatar_url: str | None


class Decision(BaseModel):
    by: PersonRef | None  # null when that account was deleted
    at: datetime
    approved: bool


class ReceiptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    content_type: str
    size: int


class ExpenseRead(BaseModel):
    id: int
    title: str
    description: str | None
    category: ExpenseCategory
    amount: Decimal  # "12.50"
    currency: str  # always "EUR" for now
    spent_on: date
    status: ExpenseStatus
    submitted_at: datetime
    user: PersonRef
    # Who has it now: the team lead's name, "HR", or null once it's decided or withdrawn
    waiting_for: str | None
    lead_decision: Decision | None  # null when there's no team lead step (or it isn't decided yet)
    hr_decision: Decision | None
    rejection_reason: str | None
    receipts: list[ReceiptRead]
