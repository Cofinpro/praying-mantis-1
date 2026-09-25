"""Admin reports. Each report is one SELECT with GROUP BY subqueries, whatever the number of rows."""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import case, func, literal_column, select
from sqlalchemy.orm import Session, joinedload

from app.models import Enrollment, EnrollmentStatus, Training, User
from app.services.trainings import average_rating_column, rating_count_column

S = EnrollmentStatus


@dataclass
class TrainingReport:
    training: Training
    waitlisted: int
    pending: int
    approved: int
    rejected: int
    withdrawn: int
    average_rating: float | None
    rating_count: int


def _count_where(status: EnrollmentStatus):
    # SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END): MySQL has no COUNT(*) FILTER (WHERE ...)
    return func.sum(case((Enrollment.status == status, 1), else_=0))


def trainings(db: Session, starts_from: date | None = None, starts_to: date | None = None) -> list[TrainingReport]:
    """Every training (cancelled too), newest first, optionally starting in [starts_from, starts_to] (UTC days)."""
    statuses = [S.WAITLISTED, S.PENDING, S.APPROVED, S.REJECTED, S.WITHDRAWN]
    # One row per training that has enrollments. Grouping in a subquery keeps the outer
    # SELECT free to join the trainer (joinedload) without GROUP BY rules getting in the way.
    counts = (
        select(Enrollment.training_id, *[_count_where(s).label(s.value) for s in statuses])
        .group_by(Enrollment.training_id)
        .subquery()
    )
    query = (
        select(
            Training,
            *[func.coalesce(counts.c[s.value], 0) for s in statuses],  # no enrollments = no row = 0
            average_rating_column(),
            rating_count_column(),
        )
        .outerjoin(counts, counts.c.training_id == Training.id)
        .options(joinedload(Training.trainer))
        .order_by(Training.starts_at.desc(), Training.id.desc())
    )
    if starts_from is not None:
        query = query.where(Training.starts_at >= datetime.combine(starts_from, time(), UTC))
    if starts_to is not None:
        query = query.where(Training.starts_at < datetime.combine(starts_to + timedelta(days=1), time(), UTC))
    return [TrainingReport(*row) for row in db.execute(query)]


@dataclass
class PersonReport:
    user: User
    completed: int
    completed_minutes: int
    last_completed_at: datetime | None
    upcoming: int


def people(db: Session) -> list[PersonReport]:
    """Everyone, by name, with what they completed and what's coming up."""
    now = datetime.now(UTC)
    taking_part = (Enrollment.status == S.APPROVED) & Training.cancelled_at.is_(None)
    completed = (
        select(
            Enrollment.user_id,
            func.count().label("n"),
            # TIMESTAMPDIFF(MINUTE, starts_at, ends_at): MySQL's way to subtract two datetimes
            func.sum(func.timestampdiff(literal_column("MINUTE"), Training.starts_at, Training.ends_at)).label("minutes"),
            func.max(Training.ends_at).label("last"),
        )
        .join(Enrollment.training)
        .where(taking_part, Training.ends_at <= now)
        .group_by(Enrollment.user_id)
        .subquery()
    )
    upcoming = (
        select(Enrollment.user_id, func.count().label("n"))
        .join(Enrollment.training)
        .where(taking_part, Training.ends_at > now)
        .group_by(Enrollment.user_id)
        .subquery()
    )
    query = (
        select(
            User,
            func.coalesce(completed.c.n, 0),
            func.coalesce(completed.c.minutes, 0),
            completed.c["last"],
            func.coalesce(upcoming.c.n, 0),
        )
        .outerjoin(completed, completed.c.user_id == User.id)
        .outerjoin(upcoming, upcoming.c.user_id == User.id)
        .options(joinedload(User.team_lead))
        .order_by(User.name, User.id)
    )
    return [
        PersonReport(user, int(n), int(minutes), last, int(up)) for user, n, minutes, last, up in db.execute(query)
    ]
