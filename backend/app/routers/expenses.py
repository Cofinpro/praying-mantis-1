from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Form, Response, status

from app.dependencies import CurrentUser, DbSession
from app.email import send_email
from app.models import Expense, ExpenseStatus
from app.schemas.expense import Decision, ExpenseCreate, ExpenseRead, ExpenseReject, PersonRef, ReceiptRead
from app.services import expenses as service

router = APIRouter(tags=["expenses"])

UNAUTHORIZED = {401: {"description": "Missing, invalid or expired token"}}
NOT_FOUND = {404: {"description": "Expense not found, or not yours to see"}}
DECIDE = UNAUTHORIZED | NOT_FOUND | {
    403: {"description": "Not your step to decide (or your own expense)"},
    409: {"description": "not_pending | second_approver_needed"},
}


def to_read(expense: Expense) -> ExpenseRead:
    def person(user) -> PersonRef | None:
        return PersonRef.model_validate(user) if user is not None else None

    rejected_by_lead = expense.status == ExpenseStatus.REJECTED and expense.hr_decided_at is None
    return ExpenseRead(
        id=expense.id,
        title=expense.title,
        description=expense.description,
        category=expense.category,
        amount=expense.amount,
        currency=expense.currency,
        spent_on=expense.spent_on,
        status=expense.status,
        submitted_at=expense.submitted_at,
        user=PersonRef.model_validate(expense.user),
        waiting_for=service.waiting_for(expense),
        lead_decision=Decision(by=person(expense.lead_decided_by), at=expense.lead_decided_at, approved=not rejected_by_lead)
        if expense.lead_decided_at
        else None,
        hr_decision=Decision(
            by=person(expense.hr_decided_by), at=expense.hr_decided_at, approved=expense.status == ExpenseStatus.APPROVED
        )
        if expense.hr_decided_at
        else None,
        rejection_reason=expense.rejection_reason,
        receipts=[ReceiptRead.model_validate(r) for r in expense.receipts],
    )


@router.post(
    "/expenses",
    status_code=status.HTTP_201_CREATED,
    responses=UNAUTHORIZED
    | {
        422: {
            "description": "Field errors, plus spent_in_future | spent_too_long_ago | receipt_count | "
            "receipt_type | receipt_empty | receipt_too_large | receipt_mismatch"
        }
    },
)
def submit_expense(
    data: Annotated[ExpenseCreate, Form()], db: DbSession, user: CurrentUser, background: BackgroundTasks
) -> ExpenseRead:
    """Claim money back (multipart/form-data). Goes to my team lead first (or straight to HR when I have none),
    who is notified in the app and by email."""
    # A plain def: FastAPI runs it in a worker thread, so these sync reads don't block the event loop.
    # Each read stops one byte past the limit, so an oversized file is refused without reading all of it.
    uploads = [(f.filename, f.file.read(service.MAX_RECEIPT_BYTES + 1)) for f in data.receipts]
    outcome = service.submit(db, user, data, uploads)
    for email in outcome.emails:
        background.add_task(send_email, email)
    return to_read(outcome.expense)


@router.get("/me/expenses", responses=UNAUTHORIZED)
def my_expenses(db: DbSession, user: CurrentUser) -> list[ExpenseRead]:
    """Mine, newest first."""
    return [to_read(e) for e in service.mine(db, user)]


@router.get("/expense-approvals", responses=UNAUTHORIZED)
def expenses_to_decide(db: DbSession, user: CurrentUser) -> list[ExpenseRead]:
    """What waits for me: my reports' expenses (as their team lead) and, for HR and admins, the HR step. Oldest first."""
    return [to_read(e) for e in service.to_decide(db, user)]


@router.get("/expenses/{expense_id}", responses=UNAUTHORIZED | NOT_FOUND)
def get_expense(expense_id: int, db: DbSession, user: CurrentUser) -> ExpenseRead:
    """For the submitter, their team lead, whoever decided it, HR and admins."""
    return to_read(service.get(db, user, expense_id))


@router.get(
    "/expenses/{expense_id}/receipts/{receipt_id}/file",
    response_class=Response,
    responses=UNAUTHORIZED | NOT_FOUND | {200: {"content": {"application/pdf": {}, "image/*": {}}}},
)
def download_receipt(expense_id: int, receipt_id: int, db: DbSession, user: CurrentUser) -> Response:
    """The receipt itself, as a download (see materials: attachment + nosniff)."""
    found = service.receipt(db, user, expense_id, receipt_id)
    ascii_name = found.filename.encode("ascii", "replace").decode().replace('"', "'")
    return Response(
        content=found.data,
        media_type=found.content_type,
        headers={
            "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(found.filename)}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/expenses/{expense_id}/approve", responses=DECIDE)
def approve_expense(expense_id: int, db: DbSession, user: CurrentUser, background: BackgroundTasks) -> ExpenseRead:
    """As team lead: sends it on to HR. As HR (or an admin): approves it for good."""
    outcome = service.approve(db, user, expense_id)
    for email in outcome.emails:
        background.add_task(send_email, email)
    return to_read(outcome.expense)


@router.post("/expenses/{expense_id}/reject", responses=DECIDE)
def reject_expense(expense_id: int, body: ExpenseReject, db: DbSession, user: CurrentUser) -> ExpenseRead:
    """At either step, with a reason the submitter sees."""
    return to_read(service.reject(db, user, expense_id, body.reason))


@router.post(
    "/expenses/{expense_id}/withdraw",
    responses=UNAUTHORIZED | NOT_FOUND | {403: {"description": "Not yours"}, 409: {"description": "not_withdrawable"}},
)
def withdraw_expense(expense_id: int, db: DbSession, user: CurrentUser) -> ExpenseRead:
    """While it's still waiting for the team lead or HR."""
    return to_read(service.withdraw(db, user, expense_id))
