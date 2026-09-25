"""Enrollment rules. Every rule lives here; routers only call these functions.

Status flow:  (none) -> pending -> approved | rejected
                        pending | approved -> withdrawn
"""

from datetime import UTC, datetime

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.errors import Conflict, Forbidden, NotFound
from app.models import Enrollment, EnrollmentStatus, Training, User


def count_approved(db: Session, training_id: int, locking: bool = False) -> int:
    """Approved enrollments take a seat; pending ones don't (Q7).

    locking=True makes it a locking read (... FOR SHARE). Under MySQL's default
    REPEATABLE READ, a plain SELECT inside a transaction reads the snapshot taken at
    the transaction's first read, so it can miss an approval another transaction
    committed a moment ago. A locking read always sees the latest committed rows.
    """
    query = (
        select(func.count())
        .select_from(Enrollment)
        .where(Enrollment.training_id == training_id, Enrollment.status == EnrollmentStatus.APPROVED)
    )
    if locking:
        query = query.with_for_update(read=True)
    return db.scalar(query)


def request(db: Session, user: User, training_id: int) -> Enrollment:
    """The user asks for a seat. Returns the pending enrollment, or raises why not."""
    training = db.get(Training, training_id)
    if training is None:
        raise NotFound("Training not found")
    if user.level not in training.levels:
        raise Forbidden("This training isn't for your level")
    if training.cancelled:
        raise Conflict("training_cancelled", "This training is cancelled")
    if training.starts_at <= datetime.now(UTC):
        raise Conflict("training_started", "This training has already started")

    existing = db.scalar(
        select(Enrollment).where(Enrollment.training_id == training.id, Enrollment.user_id == user.id)
    )
    if existing is not None:
        if existing.status in (EnrollmentStatus.PENDING, EnrollmentStatus.APPROVED):
            raise Conflict("already_requested", "You've already requested this training")
        if existing.status == EnrollmentStatus.REJECTED:
            raise Conflict("request_rejected", "Your request for this training was rejected")

    # Pending requests are allowed up to the last free seat; approval checks again (BE-3.2)
    if count_approved(db, training.id) >= training.max_seats:
        raise Conflict("training_full", "This training is full")

    if existing is not None:  # withdrawn earlier: the same row starts over
        enrollment = existing
        enrollment.status = EnrollmentStatus.PENDING
        enrollment.requested_at = datetime.now(UTC)
        enrollment.decision_comment = None
        enrollment.decided_by_id = None
        enrollment.decided_at = None
    else:
        enrollment = Enrollment(training_id=training.id, user_id=user.id)
        db.add(enrollment)

    try:
        # TODO(BE-4.1): notify the user's team lead (or the admins, if they have none)
        db.commit()
    except IntegrityError:
        # Two requests at the same moment: UNIQUE (training_id, user_id) lets one win
        db.rollback()
        raise Conflict("already_requested", "You've already requested this training") from None
    db.refresh(enrollment)
    return enrollment


# --- deciding: approvals list, approve, reject ---


def _decidable_by(decider: User) -> ColumnElement[bool]:
    """SQL for "decider may decide this enrollment's user" (row-level authorization).

    The user's team lead decides. Admins decide for users who have no team lead (Q6).
    Nobody decides their own request.
    """
    decides_for = User.team_lead_id == decider.id
    if decider.is_admin:
        decides_for = or_(decides_for, User.team_lead_id.is_(None))
    return and_(decides_for, User.id != decider.id)


def can_decide(decider: User, requester: User) -> bool:
    """The same rule as _decidable_by, for one enrollment already in memory."""
    if requester.id == decider.id:
        return False
    return requester.team_lead_id == decider.id or (
        decider.is_admin and requester.team_lead_id is None
    )


def pending_for(db: Session, decider: User) -> list[Enrollment]:
    """Pending requests the decider can act on, for upcoming, uncancelled trainings, oldest first."""
    query = (
        select(Enrollment)
        .join(Enrollment.user)
        .join(Enrollment.training)
        .where(
            Enrollment.status == EnrollmentStatus.PENDING,
            _decidable_by(decider),
            Training.cancelled_at.is_(None),
            Training.starts_at > datetime.now(UTC),
        )
        .options(joinedload(Enrollment.user))
        .order_by(Enrollment.requested_at, Enrollment.id)
    )
    return list(db.scalars(query))


def _lock_for_decision(db: Session, decider: User, enrollment_id: int) -> tuple[Enrollment, Training]:
    """Loads and locks the training row, then the enrollment row, and checks the decider.

    Always lock in the same order (training, then enrollment) everywhere, so two
    transactions can't each hold one lock and wait for the other (a deadlock).
    """
    enrollment = db.get(Enrollment, enrollment_id)
    if enrollment is None:
        raise NotFound("Enrollment not found")
    if not can_decide(decider, enrollment.user):
        raise Forbidden("You can only decide requests from your own reports")

    training = db.get(Training, enrollment.training_id, with_for_update=True, populate_existing=True)
    enrollment = db.get(Enrollment, enrollment_id, with_for_update=True, populate_existing=True)
    if enrollment.status != EnrollmentStatus.PENDING:
        raise Conflict("not_pending", f"This request is already {enrollment.status}")
    if training.cancelled:
        raise Conflict("training_cancelled", "This training is cancelled")
    if training.starts_at <= datetime.now(UTC):
        raise Conflict("training_started", "This training has already started")
    return enrollment, training


def _decide(enrollment: Enrollment, decider: User, status: EnrollmentStatus, comment: str | None) -> None:
    enrollment.status = status
    enrollment.decided_by_id = decider.id
    enrollment.decided_at = datetime.now(UTC)
    enrollment.decision_comment = comment


def approve(db: Session, decider: User, enrollment_id: int, comment: str | None = None) -> Enrollment:
    """Approves a pending request if there's still a seat. One transaction, training row locked.

    Two leads approving the last seat at the same moment: the second one waits at the
    training lock until the first commits, then recounts and gets training_full.
    """
    enrollment, training = _lock_for_decision(db, decider, enrollment_id)
    if count_approved(db, training.id, locking=True) >= training.max_seats:
        raise Conflict("training_full", "This training is full")

    _decide(enrollment, decider, EnrollmentStatus.APPROVED, comment)
    # TODO(BE-4.1): notify the requester, in this same transaction
    db.commit()
    db.refresh(enrollment)
    return enrollment


def reject(db: Session, decider: User, enrollment_id: int, comment: str | None = None) -> Enrollment:
    """Rejects a pending request. The user can't request this training again (Q8)."""
    enrollment, _ = _lock_for_decision(db, decider, enrollment_id)
    _decide(enrollment, decider, EnrollmentStatus.REJECTED, comment)
    # TODO(BE-4.1): notify the requester, in this same transaction
    db.commit()
    db.refresh(enrollment)
    return enrollment
