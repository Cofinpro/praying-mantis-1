"""Enrollment rules. Every rule lives here; routers only call these functions."""

from datetime import UTC, datetime

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.errors import Conflict, Forbidden, NotFound
from app.models import Enrollment, EnrollmentStatus, NotificationType, Training, User
from app.services import notifications


# --- the status state machine ---
#
#   (none) ──request──▶ pending ──approve──▶ approved
#     │                   ▲ │  └────reject───▶ rejected
#     │    a place opens  │ └──withdraw──▶ withdrawn ◀──withdraw── approved
#     └─join_waitlist─▶ waitlisted ──withdraw──▶ withdrawn
#       (only when full)
#
# (A withdrawn request can be requested again: see request().)

ALLOWED_MOVES: dict[EnrollmentStatus, set[EnrollmentStatus]] = {
    EnrollmentStatus.WAITLISTED: {EnrollmentStatus.PENDING, EnrollmentStatus.WITHDRAWN},
    EnrollmentStatus.PENDING: {
        EnrollmentStatus.APPROVED,
        EnrollmentStatus.REJECTED,
        EnrollmentStatus.WITHDRAWN,
    },
    EnrollmentStatus.APPROVED: {EnrollmentStatus.WITHDRAWN},
    EnrollmentStatus.REJECTED: set(),
    EnrollmentStatus.WITHDRAWN: set(),
}

# The 409 code when a move isn't allowed, by the status we tried to move to
REFUSED_MOVE_CODES = {
    EnrollmentStatus.APPROVED: "not_pending",
    EnrollmentStatus.REJECTED: "not_pending",
    EnrollmentStatus.WITHDRAWN: "not_withdrawable",
}


def check_move(current: EnrollmentStatus, target: EnrollmentStatus) -> None:
    """The one place that decides which status changes are allowed."""
    if target not in ALLOWED_MOVES[current]:
        code = REFUSED_MOVE_CODES.get(target, "invalid_status_change")
        raise Conflict(code, f"This request is already {current}")


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


def count_open(db: Session, training_id: int) -> int:
    """How many pending or approved enrollments compete for the seats (waitlisted ones don't).
    Always a locking read: see count_approved()."""
    return db.scalar(
        select(func.count())
        .select_from(Enrollment)
        .where(
            Enrollment.training_id == training_id,
            Enrollment.status.in_([EnrollmentStatus.PENDING, EnrollmentStatus.APPROVED]),
        )
        .with_for_update(read=True)
    )


def _check_can_join(db: Session, user: User, training_id: int) -> tuple[Training, Enrollment | None]:
    """The checks shared by request() and join_waitlist(). Returns the training and any earlier row."""
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
        if existing.status == EnrollmentStatus.WAITLISTED:
            raise Conflict("already_waitlisted", "You're already on the waitlist for this training")
        if existing.status in (EnrollmentStatus.PENDING, EnrollmentStatus.APPROVED):
            raise Conflict("already_requested", "You've already requested this training")
        if existing.status == EnrollmentStatus.REJECTED:
            raise Conflict("request_rejected", "Your request for this training was rejected")
    return training, existing


def _new_or_restarted(db: Session, user: User, training: Training, existing: Enrollment | None,
                      status: EnrollmentStatus) -> Enrollment:
    if existing is not None:  # withdrawn earlier: the same row starts over
        enrollment = existing
        enrollment.requested_at = datetime.now(UTC)
        enrollment.decision_comment = None
        enrollment.decided_by_id = None
        enrollment.decided_at = None
    else:
        enrollment = Enrollment(training_id=training.id, user_id=user.id)
        db.add(enrollment)
    enrollment.status = status
    return enrollment


def _commit_new(db: Session, enrollment: Enrollment) -> Enrollment:
    try:
        db.commit()  # the enrollment and its notification together
    except IntegrityError:
        # Two requests at the same moment: UNIQUE (training_id, user_id) lets one win
        db.rollback()
        raise Conflict("already_requested", "You've already requested this training") from None
    db.refresh(enrollment)
    return enrollment


def request(db: Session, user: User, training_id: int) -> Enrollment:
    """The user asks for a seat. Returns the pending enrollment, or raises why not."""
    training, existing = _check_can_join(db, user, training_id)

    # Pending requests are allowed up to the last free seat; approval checks again (BE-3.2).
    # A full training has a waitlist instead: join_waitlist().
    if count_approved(db, training.id) >= training.max_seats:
        raise Conflict("training_full", "This training is full")

    enrollment = _new_or_restarted(db, user, training, existing, EnrollmentStatus.PENDING)
    notifications.notify(
        db,
        notifications.deciders_for(db, user),
        NotificationType.ENROLLMENT_REQUESTED,
        f"{user.name} requested a seat in {training.name}",
        link="/approvals",
    )
    return _commit_new(db, enrollment)


# --- the waitlist ---


def join_waitlist(db: Session, user: User, training_id: int) -> Enrollment:
    """Only for a full training: waits in line, first come first served. Nobody is notified yet."""
    training, existing = _check_can_join(db, user, training_id)
    # Lock the training, like withdraw() does: a seat freed at this very moment either happens
    # first (and we say "not full") or waits for us (and then promotes us)
    db.get(Training, training.id, with_for_update=True, populate_existing=True)
    if count_approved(db, training.id, locking=True) < training.max_seats:
        raise Conflict("training_not_full", "This training still has seats: request one instead")
    enrollment = _new_or_restarted(db, user, training, existing, EnrollmentStatus.WAITLISTED)
    return _commit_new(db, enrollment)


def promote_waitlist(db: Session, training: Training) -> list[Enrollment]:
    """Moves the oldest waitlisted people to pending while there are places nobody is asking for.

    A place is free when max_seats > pending + approved: so a promoted person never competes
    with an earlier pending request for the same seat. Called, inside the caller's transaction
    (with the training row locked), after anything that frees a place: a withdrawal, a
    rejection, or more max_seats. Doesn't commit.
    """
    if training.cancelled or training.starts_at <= datetime.now(UTC):
        return []
    db.flush()  # SessionLocal has autoflush=False: send the caller's status change before we count
    free = training.max_seats - count_open(db, training.id)
    if free <= 0:
        return []
    promoted = list(
        db.scalars(
            select(Enrollment)
            .where(Enrollment.training_id == training.id, Enrollment.status == EnrollmentStatus.WAITLISTED)
            .order_by(Enrollment.requested_at, Enrollment.id)
            .limit(free)
            .with_for_update()
        )
    )
    for enrollment in promoted:
        check_move(enrollment.status, EnrollmentStatus.PENDING)
        # requested_at stays: it's still the moment they asked, and the approvals list is oldest first
        enrollment.status = EnrollmentStatus.PENDING
        notifications.notify(
            db,
            [enrollment.user],
            NotificationType.WAITLIST_PROMOTED,
            f"A place opened up in {training.name}: your request now waits for approval",
            link=notifications.training_link(training),
        )
        notifications.notify(
            db,
            notifications.deciders_for(db, enrollment.user),
            NotificationType.ENROLLMENT_REQUESTED,
            f"{enrollment.user.name} moved up from the waitlist for {training.name}",
            link="/approvals",
        )
    return promoted


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
        # The requester's avatar row joins in too (its image bytes are deferred), for Requester.avatar_url
        .options(joinedload(Enrollment.user).joinedload(User.avatar))
        .order_by(Enrollment.requested_at, Enrollment.id)
    )
    return list(db.scalars(query))


def _get_enrollment(db: Session, enrollment_id: int) -> Enrollment:
    enrollment = db.get(Enrollment, enrollment_id)
    if enrollment is None:
        raise NotFound("Enrollment not found")
    return enrollment


def _lock(db: Session, enrollment: Enrollment) -> tuple[Enrollment, Training]:
    """Locks the training row, then the enrollment row, and re-reads both.

    Always lock in the same order (training, then enrollment) everywhere, so two
    transactions can't each hold one lock and wait for the other (a deadlock).
    """
    training = db.get(Training, enrollment.training_id, with_for_update=True, populate_existing=True)
    enrollment = db.get(Enrollment, enrollment.id, with_for_update=True, populate_existing=True)
    return enrollment, training


def _lock_for_decision(
    db: Session, decider: User, enrollment_id: int, target: EnrollmentStatus
) -> tuple[Enrollment, Training]:
    """Checks the decider, locks, and checks the move and the training."""
    enrollment = _get_enrollment(db, enrollment_id)
    if not can_decide(decider, enrollment.user):
        raise Forbidden("You can only decide requests from your own reports")

    enrollment, training = _lock(db, enrollment)
    check_move(enrollment.status, target)
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
    enrollment, training = _lock_for_decision(db, decider, enrollment_id, EnrollmentStatus.APPROVED)
    if count_approved(db, training.id, locking=True) >= training.max_seats:
        raise Conflict("training_full", "This training is full")

    _decide(enrollment, decider, EnrollmentStatus.APPROVED, comment)
    notifications.notify(
        db,
        [enrollment.user],
        NotificationType.ENROLLMENT_APPROVED,
        f"You're in: {decider.name} approved your seat in {training.name}",
        link=notifications.training_link(training),
    )
    db.commit()  # the decision and its notification together
    db.refresh(enrollment)
    return enrollment


def reject(db: Session, decider: User, enrollment_id: int, comment: str | None = None) -> Enrollment:
    """Rejects a pending request. The user can't request this training again (Q8)."""
    enrollment, training = _lock_for_decision(db, decider, enrollment_id, EnrollmentStatus.REJECTED)
    _decide(enrollment, decider, EnrollmentStatus.REJECTED, comment)
    reason = f": {comment}" if comment else ""
    notifications.notify(
        db,
        [enrollment.user],
        NotificationType.ENROLLMENT_REJECTED,
        f"{decider.name} rejected your request for {training.name}{reason}",
        link=notifications.training_link(training),
    )
    promote_waitlist(db, training)  # the rejected request no longer holds a place
    db.commit()  # the decision and its notification together
    db.refresh(enrollment)
    return enrollment


# --- withdrawing ---


def withdraw(db: Session, user: User, enrollment_id: int) -> Enrollment:
    """The owner withdraws a waitlisted, pending or approved enrollment before the training starts.

    Withdrawing an approved enrollment frees its seat (seats_left goes up), and a pending one
    frees its place: either way the next person on the waitlist moves up.
    The decision fields stay, as a record of who had approved it.
    """
    enrollment = _get_enrollment(db, enrollment_id)
    if enrollment.user_id != user.id:
        raise Forbidden("You can only withdraw your own requests")

    enrollment, training = _lock(db, enrollment)
    check_move(enrollment.status, EnrollmentStatus.WITHDRAWN)
    if training.starts_at <= datetime.now(UTC):
        raise Conflict("training_started", "This training has already started")

    was_approved = enrollment.status == EnrollmentStatus.APPROVED
    enrollment.status = EnrollmentStatus.WITHDRAWN
    if was_approved:  # a pending request just disappears from the queue: no need to tell anyone
        notifications.notify(
            db,
            notifications.deciders_for(db, user),
            NotificationType.ENROLLMENT_WITHDRAWN,
            f"{user.name} withdrew from {training.name}, so a seat is free again",
            link=notifications.training_link(training),
        )
    promote_waitlist(db, training)
    db.commit()
    db.refresh(enrollment)
    return enrollment
