"""Reminders the day before: a training you're approved for, and a seat you booked.

send_due() is safe to run as often as you like, from several processes at once:
- reminded_at marks what was already sent
- SKIP LOCKED lets a second run pass over rows the first one is still sending
"""

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.email import Email
from app.models import Enrollment, EnrollmentStatus, NotificationType, SeatReservation, Training
from app.services import notifications
from app.services.seats import office_today

# A training is "due" once it starts within this window
TRAINING_WINDOW = timedelta(hours=24)


@dataclass
class ReminderRun:
    trainings: int = 0
    seats: int = 0
    emails: list[Email] = field(default_factory=list)


def next_working_day(day: date) -> date:
    """The next Monday–Friday after `day`: on a Friday, that's Monday."""
    day += timedelta(days=1)
    while day.weekday() >= 5:
        day += timedelta(days=1)
    return day


def _office_time(moment: datetime) -> datetime:
    return moment.astimezone(ZoneInfo(settings.office_timezone))


def _when(starts_at: datetime, now: datetime) -> str:
    """"today at 14:00" / "tomorrow at 09:00", in office time."""
    local, today = _office_time(starts_at), _office_time(now).date()
    day = "today" if local.date() == today else "tomorrow" if local.date() == today + timedelta(days=1) else f"on {local:%a %d %b}"
    return f"{day} at {local:%H:%M}"


def _training_reminders(db: Session, now: datetime, run: ReminderRun) -> None:
    due = db.scalars(
        select(Enrollment)
        .join(Enrollment.training)
        .where(
            Enrollment.status == EnrollmentStatus.APPROVED,
            Enrollment.reminded_at.is_(None),
            Training.cancelled_at.is_(None),
            Training.starts_at > now,
            Training.starts_at <= now + TRAINING_WINDOW,
        )
        .options(joinedload(Enrollment.user), joinedload(Enrollment.training))
        .with_for_update(skip_locked=True, of=Enrollment)
    )
    for enrollment in due:
        training, user = enrollment.training, enrollment.user
        message = f"Reminder: {training.name} starts {_when(training.starts_at, now)}"
        notifications.notify(
            db, [user], NotificationType.TRAINING_REMINDER, message, link=notifications.training_link(training)
        )
        run.emails.append(
            Email(
                to=user.email,
                subject=message,
                body=f"Hi {user.name},\n\n{message}.\n\nDetails: {settings.app_url}/trainings/{training.id}\n\n— PreyingMantis",
            )
        )
        enrollment.reminded_at = now
        run.trainings += 1


def _seat_reminders(db: Session, now: datetime, run: ReminderRun) -> None:
    today = office_today()
    # Booked today for the next working day: they just did it, so no reminder
    start_of_today = datetime.combine(today, datetime.min.time(), ZoneInfo(settings.office_timezone))
    due = db.scalars(
        select(SeatReservation)
        .where(
            SeatReservation.date == next_working_day(today),
            SeatReservation.reminded_at.is_(None),
            SeatReservation.created_at < start_of_today.astimezone(UTC),
        )
        .options(joinedload(SeatReservation.user), joinedload(SeatReservation.seat))
        .with_for_update(skip_locked=True, of=SeatReservation)
    )
    for reservation in due:
        user, seat = reservation.user, reservation.seat
        message = f"Reminder: your seat {seat.label} is booked for {reservation.date:%a %d %b}"
        notifications.notify(db, [user], NotificationType.SEAT_REMINDER, message, link="/seats")
        run.emails.append(
            Email(
                to=user.email,
                subject=message,
                body=f"Hi {user.name},\n\n{message}.\n\nSee the map: {settings.app_url}/seats\n\n— PreyingMantis",
            )
        )
        reservation.reminded_at = now
        run.seats += 1


def send_due(db: Session) -> ReminderRun:
    """Adds every due reminder as a notification and commits. The emails are returned, not sent."""
    now = datetime.now(UTC)
    run = ReminderRun()
    _training_reminders(db, now, run)
    _seat_reminders(db, now, run)
    db.commit()  # the notifications and the reminded_at marks together
    return run
