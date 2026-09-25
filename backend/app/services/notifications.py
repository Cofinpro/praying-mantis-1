"""Notifications: writing them (called by other services) and reading them (the bell).

notify() only adds rows to the session. It never commits: the calling service
commits once, so an approval and its notification are saved together or not at all.
"""

from collections.abc import Iterable
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.config import settings
from app.email import Email
from app.errors import NotFound
from app.models import Enrollment, EnrollmentStatus, Notification, NotificationType, Training, User


def notify(
    db: Session,
    recipients: Iterable[User],
    type_: NotificationType,
    message: str,
    link: str | None = None,
) -> None:
    """Adds one notification per recipient to the current transaction (no commit)."""
    for recipient in {user.id: user for user in recipients}.values():  # no duplicates
        db.add(Notification(user_id=recipient.id, type=type_, message=message, link=link))


def deciders_for(db: Session, requester: User) -> list[User]:
    """Who decides this user's requests: their team lead, or every admin if they have none."""
    if requester.team_lead is not None:
        return [requester.team_lead]
    return list(db.scalars(select(User).where(User.is_admin, User.id != requester.id)))


def enrolled_people(db: Session, training: Training) -> list[User]:
    """Everyone waitlisted, pending or approved in the training."""
    return list(
        db.scalars(
            select(User)
            .join(Enrollment, Enrollment.user_id == User.id)
            .where(
                Enrollment.training_id == training.id,
                Enrollment.status.in_(
                    [EnrollmentStatus.WAITLISTED, EnrollmentStatus.PENDING, EnrollmentStatus.APPROVED]
                ),
            )
        )
    )


def training_link(training: Training) -> str:
    return f"/trainings/{training.id}"


def request_emails(db: Session, enrollment: Enrollment) -> list[Email]:
    """The emails for a new request: one to each decider (BE-4.2). Built, not sent."""
    requester, training = enrollment.user, enrollment.training
    return [
        Email(
            to=decider.email,
            subject=f"Approval needed: {requester.name} → {training.name}",
            body=(
                f"Hi {decider.name},\n\n"
                f"{requester.name} requested a seat in {training.name} "
                f"on {training.starts_at:%a %d %b %Y, %H:%M} UTC.\n\n"
                f"Approve or reject it here: {settings.app_url}/approvals\n\n"
                "— PreyingMantis"
            ),
        )
        for decider in deciders_for(db, requester)
    ]


# --- the bell ---


def list_for(db: Session, user: User, limit: int) -> tuple[int, list[Notification]]:
    """(unread count, the latest `limit` notifications, newest first)."""
    unread = db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    items = db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
    )
    return unread, list(items)


def mark_read(db: Session, user: User, notification_id: int) -> None:
    """Idempotent: marking an already-read notification again changes nothing."""
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise NotFound("Notification not found")  # someone else's: don't reveal it exists
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
    db.commit()


def mark_all_read(db: Session, user: User) -> None:
    # One UPDATE statement, not a loop over rows
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    db.commit()
