"""Enrollment rules. Every rule lives here; routers only call these functions.

Status flow:  (none) -> pending -> approved | rejected
                        pending | approved -> withdrawn
"""

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import Conflict, Forbidden, NotFound
from app.models import Enrollment, EnrollmentStatus, Training, User


def count_approved(db: Session, training_id: int) -> int:
    """Approved enrollments take a seat; pending ones don't (Q7)."""
    return db.scalar(
        select(func.count())
        .select_from(Enrollment)
        .where(Enrollment.training_id == training_id, Enrollment.status == EnrollmentStatus.APPROVED)
    )


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
