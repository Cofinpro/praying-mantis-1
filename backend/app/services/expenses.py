"""Expense claims: submit with receipts, approved by the team lead and then by HR. No HTTP here.

    submit ──▶ pending_lead ──lead approves──▶ pending_hr ──HR approves──▶ approved
    (no lead ─────────────────────────────────▲)
               either pending step ──reject (with a reason)──▶ rejected
               either pending step ──the submitter withdraws──▶ withdrawn

Who decides:
- pending_lead: the submitter's team lead
- pending_hr: HR users, and admins (the privileged accounts). They're told by notification;
  if nobody has the HR role yet, the admins are.
- Nobody decides their own expense, and the HR step needs a different person than the lead
  who approved it (two different people approve every expense).
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app import files
from app.config import settings
from app.email import Email
from app.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.models import Expense, ExpenseReceipt, ExpenseStatus, NotificationType, User
from app.schemas.expense import ExpenseCreate
from app.services import notifications
from app.services.seats import office_today

S = ExpenseStatus

MAX_RECEIPTS = 5
MAX_RECEIPT_BYTES = 5 * 1024 * 1024
OLDEST_DAYS = 90  # a receipt older than this is too late to claim

RECEIPT_TYPES = {
    ".pdf": ("application/pdf", files.is_pdf),
    ".png": ("image/png", files.is_png),
    ".jpg": ("image/jpeg", files.is_jpeg),
    ".jpeg": ("image/jpeg", files.is_jpeg),
    ".webp": ("image/webp", files.is_webp),
}

ALLOWED_MOVES: dict[ExpenseStatus, set[ExpenseStatus]] = {
    S.PENDING_LEAD: {S.PENDING_HR, S.REJECTED, S.WITHDRAWN},
    S.PENDING_HR: {S.APPROVED, S.REJECTED, S.WITHDRAWN},
    S.APPROVED: set(),
    S.REJECTED: set(),
    S.WITHDRAWN: set(),
}


def check_move(current: ExpenseStatus, target: ExpenseStatus) -> None:
    if target not in ALLOWED_MOVES[current]:
        code = "not_withdrawable" if target == S.WITHDRAWN else "not_pending"
        raise Conflict(code, f"This expense is already {current.replace('_', ' ')}")


def money(expense: Expense) -> str:
    return f"€{expense.amount:,.2f}"


# --- who ---


def is_hr_decider(user: User) -> bool:
    return user.is_hr or user.is_admin


def hr_recipients(db: Session, exclude: set[int]) -> list[User]:
    """Who hears about an expense waiting for HR: the HR users, or the admins while there are none."""
    hr = [u for u in db.scalars(select(User).where(User.is_hr)) if u.id not in exclude]
    if hr:
        return hr
    return [u for u in db.scalars(select(User).where(User.is_admin)) if u.id not in exclude]


def can_see(user: User, expense: Expense) -> bool:
    owner = expense.user
    return (
        owner.id == user.id
        or owner.team_lead_id == user.id
        or expense.lead_decided_by_id == user.id
        or is_hr_decider(user)
    )


def waiting_for(expense: Expense) -> str | None:
    if expense.status == S.PENDING_LEAD:
        return expense.user.team_lead.name if expense.user.team_lead else "Team lead"
    if expense.status == S.PENDING_HR:
        return "HR"
    return None


# --- submitting ---


@dataclass
class Outcome:
    """What a service call did, plus the emails the router sends after the response."""

    expense: Expense
    emails: list[Email] = field(default_factory=list)


def _receipt(filename: str | None, data: bytes) -> ExpenseReceipt:
    name = files.clean_filename(filename)
    kind = RECEIPT_TYPES.get(files.extension(name))
    if kind is None:
        raise ValidationFailed("receipts", "Receipts must be PDF, PNG, JPEG or WebP files", "receipt_type", name)
    if not data:
        raise ValidationFailed("receipts", f"{name} is empty", "receipt_empty", name)
    if len(data) > MAX_RECEIPT_BYTES:
        raise ValidationFailed("receipts", f"{name} is too large (max 5 MB)", "receipt_too_large", name)
    content_type, looks_right = kind
    if not looks_right(data):
        raise ValidationFailed("receipts", f"{name} doesn't look like a {files.extension(name)} file", "receipt_mismatch", name)
    return ExpenseReceipt(filename=name, content_type=content_type, size=len(data), data=data)


def _emails_to(deciders: list[User], expense: Expense, why: str) -> list[Email]:
    return [
        Email(
            to=decider.email,
            subject=f"Expense to approve: {expense.user.name}, {money(expense)}",
            body=(
                f"Hi {decider.name},\n\n{why}\n\n"
                f"Approve or reject it here: {settings.app_url}/approvals\n\n— PreyingMantis"
            ),
        )
        for decider in deciders
    ]


def submit(db: Session, user: User, data: ExpenseCreate, uploads: list[tuple[str | None, bytes]]) -> Outcome:
    """`uploads` is (filename, bytes) per receipt; each may be one byte over the limit, to detect it."""
    today = office_today()
    if data.spent_on > today:
        raise ValidationFailed("spent_on", "The date can't be in the future", "spent_in_future", str(data.spent_on))
    if data.spent_on < today - timedelta(days=OLDEST_DAYS):
        raise ValidationFailed(
            "spent_on", f"Expenses older than {OLDEST_DAYS} days can't be claimed", "spent_too_long_ago", str(data.spent_on)
        )
    if not 1 <= len(uploads) <= MAX_RECEIPTS:
        raise ValidationFailed("receipts", f"Add 1 to {MAX_RECEIPTS} receipts", "receipt_count", len(uploads))

    expense = Expense(
        user=user,
        title=data.title,
        description=data.description or None,
        category=data.category,
        amount=data.amount,
        spent_on=data.spent_on,
        status=S.PENDING_LEAD if user.team_lead is not None else S.PENDING_HR,
        receipts=[_receipt(name, content) for name, content in uploads],
    )
    db.add(expense)
    if expense.status == S.PENDING_LEAD:
        deciders = [user.team_lead]
        message = f"{user.name} submitted an expense: {expense.title} ({money(expense)})"
    else:
        deciders = hr_recipients(db, exclude={user.id})
        message = f"{user.name} submitted an expense for HR approval: {expense.title} ({money(expense)})"
    notifications.notify(db, deciders, NotificationType.EXPENSE_SUBMITTED, message, link="/approvals")
    db.commit()  # the expense, its receipts and the notifications together
    db.refresh(expense)
    return Outcome(expense, _emails_to(deciders, expense, message + "."))


# --- reading ---


def _with_people(query):
    # Everything ExpenseRead shows, in the same query: the submitter (+ their lead and avatar) and the deciders
    return query.options(
        joinedload(Expense.user).joinedload(User.team_lead),
        joinedload(Expense.user).joinedload(User.avatar),
        joinedload(Expense.lead_decided_by).joinedload(User.avatar),
        joinedload(Expense.hr_decided_by).joinedload(User.avatar),
    )


def mine(db: Session, user: User) -> list[Expense]:
    """My expenses, newest first."""
    query = select(Expense).where(Expense.user_id == user.id).order_by(Expense.submitted_at.desc(), Expense.id.desc())
    return list(db.scalars(_with_people(query)).unique())


def get(db: Session, user: User, expense_id: int) -> Expense:
    """The expense, or 404 when it doesn't exist or the user may not see it."""
    expense = db.scalars(_with_people(select(Expense).where(Expense.id == expense_id))).unique().one_or_none()
    if expense is None or not can_see(user, expense):
        raise NotFound("Expense not found")
    return expense


def to_decide(db: Session, user: User) -> list[Expense]:
    """What waits for this user: their reports' expenses at the lead step, and (for HR and admins)
    everyone else's at the HR step, except ones they approved as lead. Oldest first."""
    Owner = User
    for_me = (Expense.status == S.PENDING_LEAD) & (Owner.team_lead_id == user.id)
    if is_hr_decider(user):
        hr_step = (
            (Expense.status == S.PENDING_HR)
            & (Expense.user_id != user.id)
            & or_(Expense.lead_decided_by_id.is_(None), Expense.lead_decided_by_id != user.id)
        )
        for_me = or_(for_me, hr_step)
    query = (
        select(Expense)
        .join(Owner, Expense.user_id == Owner.id)
        .where(for_me)
        .order_by(Expense.submitted_at, Expense.id)
    )
    return list(db.scalars(_with_people(query)).unique())


def receipt(db: Session, user: User, expense_id: int, receipt_id: int) -> ExpenseReceipt:
    expense = get(db, user, expense_id)
    found = next((r for r in expense.receipts if r.id == receipt_id), None)
    if found is None:
        raise NotFound("Receipt not found")
    return found


# --- deciding ---


def _lock(db: Session, user: User, expense_id: int) -> Expense:
    """Checks visibility, then locks the row and re-reads it, so two decisions at once are one after the other."""
    get(db, user, expense_id)
    return db.get(Expense, expense_id, with_for_update=True, populate_existing=True)


def _check_decider(user: User, expense: Expense) -> None:
    if expense.user_id == user.id:
        raise Forbidden("You can't decide your own expense")
    if expense.status == S.PENDING_LEAD and expense.user.team_lead_id != user.id:
        raise Forbidden("Only the submitter's team lead can decide this step")
    if expense.status == S.PENDING_HR:
        if not is_hr_decider(user):
            raise Forbidden("Only HR can decide this step")
        if expense.lead_decided_by_id == user.id:
            raise Conflict("second_approver_needed", "You approved this as team lead: someone else in HR gives the second approval")


def approve(db: Session, user: User, expense_id: int) -> Outcome:
    expense = _lock(db, user, expense_id)
    if expense.status not in (S.PENDING_LEAD, S.PENDING_HR):
        check_move(expense.status, S.APPROVED)  # raises not_pending
    _check_decider(user, expense)
    now = datetime.now(UTC)
    emails: list[Email] = []
    if expense.status == S.PENDING_LEAD:
        check_move(expense.status, S.PENDING_HR)
        expense.status = S.PENDING_HR
        expense.lead_decided_by, expense.lead_decided_at = user, now
        notifications.notify(
            db,
            [expense.user],
            NotificationType.EXPENSE_LEAD_APPROVED,
            f"{user.name} approved your expense {expense.title}: it's with HR now",
            link=f"/expenses/{expense.id}",
        )
        hr = hr_recipients(db, exclude={expense.user_id, user.id})
        message = f"{expense.user.name}'s expense {expense.title} ({money(expense)}) was approved by {user.name} and needs HR approval"
        notifications.notify(db, hr, NotificationType.EXPENSE_SUBMITTED, message, link="/approvals")
        emails = _emails_to(hr, expense, message + ".")
    else:
        check_move(expense.status, S.APPROVED)
        expense.status = S.APPROVED
        expense.hr_decided_by, expense.hr_decided_at = user, now
        notifications.notify(
            db,
            [expense.user],
            NotificationType.EXPENSE_APPROVED,
            f"Your expense {expense.title} ({money(expense)}) was approved",
            link=f"/expenses/{expense.id}",
        )
    db.commit()  # the decision and its notifications together
    db.refresh(expense)
    return Outcome(expense, emails)


def reject(db: Session, user: User, expense_id: int, reason: str) -> Expense:
    expense = _lock(db, user, expense_id)
    check_move(expense.status, S.REJECTED)
    _check_decider(user, expense)
    now = datetime.now(UTC)
    if expense.status == S.PENDING_LEAD:
        expense.lead_decided_by, expense.lead_decided_at = user, now
    else:
        expense.hr_decided_by, expense.hr_decided_at = user, now
    expense.status = S.REJECTED
    expense.rejection_reason = reason
    notifications.notify(
        db,
        [expense.user],
        NotificationType.EXPENSE_REJECTED,
        f"{user.name} rejected your expense {expense.title}: {reason}",
        link=f"/expenses/{expense.id}",
    )
    db.commit()
    db.refresh(expense)
    return expense


def withdraw(db: Session, user: User, expense_id: int) -> Expense:
    expense = _lock(db, user, expense_id)
    if expense.user_id != user.id:
        raise Forbidden("You can only withdraw your own expenses")
    check_move(expense.status, S.WITHDRAWN)
    expense.status = S.WITHDRAWN
    db.commit()
    db.refresh(expense)
    return expense
