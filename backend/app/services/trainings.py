from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.orm import Session, aliased, joinedload

from app.errors import Conflict, ValidationFailed
from app.models import (
    Enrollment,
    EnrollmentStatus,
    Level,
    NotificationType,
    Training,
    TrainingFeedback,
    TrainingLevel,
    User,
)
from app.services import enrollments as enrollment_service
from app.services import notifications
from app.schemas.training import TrainingCreate, TrainingUpdate


@dataclass
class TrainingRow:
    """A training plus the values computed for one viewer, all from the same query."""

    training: Training
    seats_left: int
    my_enrollment_status: str | None
    my_enrollment_id: int | None
    average_rating: float | None
    rating_count: int
    my_rating: int | None
    my_waitlist_position: int | None


def _check_trainer_exists(db: Session, trainer_id: int | None) -> None:
    if trainer_id is not None and db.get(User, trainer_id) is None:
        raise ValidationFailed("trainer_id", "No user with this id", "trainer_not_found", trainer_id)


def create_training(db: Session, data: TrainingCreate, created_by: User) -> TrainingRow:
    _check_trainer_exists(db, data.trainer_id)

    training = Training(
        name=data.name,
        description=data.description,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        max_seats=data.max_seats,
        trainer_id=data.trainer_id,
        external_trainer_name=data.external_trainer_name,
        created_by=created_by,
        levels=data.levels,
    )
    db.add(training)
    db.commit()
    row = get_training(db, training.id, viewer=created_by)
    assert row is not None  # an admin sees every training
    return row


# --- editing and cancelling ---


def _get_for_change(db: Session, training_id: int) -> Training | None:
    # FOR UPDATE: lock the row until commit, so an approval (BE-3.2, which locks the
    # same row) can't slip in between our seat check and our write
    training = db.get(Training, training_id, with_for_update=True)
    if training is not None and training.cancelled:
        raise Conflict("training_cancelled", "This training is cancelled and can't be changed")
    return training


# Field names as people read them, for "training changed" messages
_LABELS = {
    "name": "name",
    "description": "description",
    "starts_at": "start time",
    "ends_at": "end time",
    "max_seats": "seats",
    "trainer_id": "trainer",
    "external_trainer_name": "trainer",
    "levels": "levels",
}


def _current(training: Training, field: str):
    value = getattr(training, field)
    return sorted(value) if field == "levels" else value


def update_training(
    db: Session, training_id: int, changes: TrainingUpdate, viewer: User
) -> TrainingRow | None:
    """Applies only the fields that were sent. None if the training doesn't exist."""
    training = _get_for_change(db, training_id)
    if training is None:
        return None
    data = changes.model_dump(exclude_unset=True)

    if "trainer_id" in data:
        _check_trainer_exists(db, data["trainer_id"])

    # Cross-field rules, checked on the training as it will be after the change
    starts_at = data.get("starts_at", training.starts_at)
    ends_at = data.get("ends_at", training.ends_at)
    if ends_at <= starts_at:
        field = "ends_at" if "ends_at" in data else "starts_at"
        raise ValidationFailed(field, "ends_at must be after starts_at", "ends_before_start", data.get(field))
    trainer_id = data.get("trainer_id", training.trainer_id)
    external_name = data.get("external_trainer_name", training.external_trainer_name)
    if trainer_id is not None and external_name is not None:
        field = "trainer_id" if "trainer_id" in data else "external_trainer_name"
        raise ValidationFailed(
            field,
            "Give either trainer_id or external_trainer_name, not both",
            "trainer_and_external",
            data.get(field),
        )

    if "max_seats" in data:
        approved = enrollment_service.count_approved(db, training.id)
        if data["max_seats"] < approved:
            raise Conflict(
                "max_seats_below_approved",
                f"{approved} people are already approved, so max_seats can't be lower than that",
            )

    changed = [f for f, value in data.items() if _current(training, f) != (sorted(value) if f == "levels" else value)]
    for field, value in data.items():
        setattr(training, field, value)  # "levels" goes through the association proxy
    if changed:
        notifications.notify(
            db,
            notifications.enrolled_people(db, training),
            NotificationType.TRAINING_CHANGED,
            f"{training.name} was updated ({', '.join(_LABELS[f] for f in changed)})",
            link=notifications.training_link(training),
        )
    if "max_seats" in changed:  # more seats: the waitlist may move up
        enrollment_service.promote_waitlist(db, training)
    db.commit()  # the change and its notifications together
    return get_training(db, training.id, viewer=viewer)


def cancel_training(db: Session, training_id: int, viewer: User) -> TrainingRow | None:
    """Soft delete: sets cancelled_at, the row stays. None if the training doesn't exist."""
    training = _get_for_change(db, training_id)
    if training is None:
        return None
    if training.starts_at <= datetime.now(UTC):
        raise Conflict("training_started", "A training that has already started can't be cancelled")

    training.cancelled_at = datetime.now(UTC)
    notifications.notify(
        db,
        notifications.enrolled_people(db, training),
        NotificationType.TRAINING_CANCELLED,
        f"{training.name} on {training.starts_at:%d %b} was cancelled",
        link=notifications.training_link(training),
    )
    db.commit()  # the cancellation and its notifications together
    return get_training(db, training.id, viewer=viewer)


# --- reading ---
#
# seats_left and my_enrollment_status are columns of the SELECT itself (correlated
# scalar subqueries), so a list of 50 trainings is still one query (plus one for all
# their levels), never 50.


def seats_left_column() -> ColumnElement[int]:
    # max_seats - (SELECT COUNT(*) FROM enrollments WHERE training_id = trainings.id AND status = 'approved')
    approved = (
        select(func.count())
        .where(Enrollment.training_id == Training.id, Enrollment.status == EnrollmentStatus.APPROVED)
        .correlate(Training)
        .scalar_subquery()
    )
    return (Training.max_seats - approved).label("seats_left")


def my_enrollment_status_column(viewer: User) -> ColumnElement[str | None]:
    # (SELECT status FROM enrollments WHERE training_id = trainings.id AND user_id = :viewer)
    # At most one row, thanks to UNIQUE (training_id, user_id)
    return (
        select(Enrollment.status)
        .where(Enrollment.training_id == Training.id, Enrollment.user_id == viewer.id)
        .correlate(Training)
        .scalar_subquery()
        .label("my_enrollment_status")
    )


def my_enrollment_id_column(viewer: User) -> ColumnElement[int | None]:
    # (SELECT id FROM enrollments WHERE training_id = trainings.id AND user_id = :viewer)
    # FE needs it to withdraw (POST /api/enrollments/{id}/withdraw) after a page reload
    return (
        select(Enrollment.id)
        .where(Enrollment.training_id == Training.id, Enrollment.user_id == viewer.id)
        .correlate(Training)
        .scalar_subquery()
        .label("my_enrollment_id")
    )


def average_rating_column() -> ColumnElement[float | None]:
    # (SELECT AVG(rating) FROM training_feedback WHERE training_id = trainings.id): NULL with no ratings
    return (
        select(func.avg(TrainingFeedback.rating))
        .where(TrainingFeedback.training_id == Training.id)
        .correlate(Training)
        .scalar_subquery()
        .label("average_rating")
    )


def rating_count_column() -> ColumnElement[int]:
    return (
        select(func.count())
        .select_from(TrainingFeedback)
        .where(TrainingFeedback.training_id == Training.id)
        .correlate(Training)
        .scalar_subquery()
        .label("rating_count")
    )


def my_rating_column(viewer: User) -> ColumnElement[int | None]:
    return (
        select(TrainingFeedback.rating)
        .where(TrainingFeedback.training_id == Training.id, TrainingFeedback.user_id == viewer.id)
        .correlate(Training)
        .scalar_subquery()
        .label("my_rating")
    )


def my_waitlist_position_column(viewer: User) -> ColumnElement[int | None]:
    # 1 + how many people joined the waitlist before me; NULL if I'm not waitlisted.
    # (SELECT COUNT(*) FROM enrollments ahead WHERE ahead.training_id = trainings.id
    #    AND ahead.status = 'waitlisted' AND (ahead.requested_at, ahead.id) < (mine.requested_at, mine.id))
    mine, ahead = aliased(Enrollment), aliased(Enrollment)
    before_me = (
        select(func.count())
        .select_from(ahead)
        .where(
            ahead.training_id == mine.training_id,
            ahead.status == EnrollmentStatus.WAITLISTED,
            (ahead.requested_at < mine.requested_at)
            | ((ahead.requested_at == mine.requested_at) & (ahead.id < mine.id)),
        )
        .correlate(mine)
        .scalar_subquery()
    )
    return (
        select(before_me + 1)
        .where(
            mine.training_id == Training.id,
            mine.user_id == viewer.id,
            mine.status == EnrollmentStatus.WAITLISTED,
        )
        .correlate(Training)
        .scalar_subquery()
        .label("my_waitlist_position")
    )


def _training_rows(viewer: User) -> Select:
    # Column order = TrainingRow's field order (rows are built with TrainingRow(*row))
    return select(
        Training,
        seats_left_column(),
        my_enrollment_status_column(viewer),
        my_enrollment_id_column(viewer),
        average_rating_column(),
        rating_count_column(),
        my_rating_column(viewer),
        my_waitlist_position_column(viewer),
    ).options(
        # Trainer in the same query (LEFT OUTER JOIN), not one query per training
        joinedload(Training.trainer),
    )


def _for_level(level: Level) -> ColumnElement[bool]:
    # EXISTS (SELECT 1 FROM training_levels WHERE training_id = trainings.id AND level = ...)
    return Training.level_links.any(TrainingLevel.level == level)


def list_trainings(db: Session, viewer: User, level: Level | None = None) -> list[TrainingRow]:
    """Employees: upcoming, not cancelled, for their level. Admins: everything, optionally one level."""
    query = _training_rows(viewer).order_by(Training.starts_at, Training.id)
    if viewer.is_admin:
        if level is not None:
            query = query.where(_for_level(level))
    else:
        query = query.where(
            Training.starts_at > datetime.now(UTC),
            Training.cancelled_at.is_(None),
            _for_level(viewer.level),
        )
    return [TrainingRow(*row) for row in db.execute(query)]


def my_enrollments(db: Session, viewer: User) -> dict[str, list[TrainingRow]]:
    """The viewer's trainings for the Profile page, from one query.

    upcoming:  approved, not cancelled, not ended yet (a training in progress counts)
    pending:   still waiting for a decision or on the waitlist, not started, not cancelled
    completed: approved, not cancelled, ended (Q10: no attendance check)
    Upcoming and pending are soonest first; completed is most recent first.
    """
    now = datetime.now(UTC)
    query = (
        _training_rows(viewer)
        .join(Enrollment, (Enrollment.training_id == Training.id) & (Enrollment.user_id == viewer.id))
        .where(
            Training.cancelled_at.is_(None),
            Enrollment.status.in_(
                [EnrollmentStatus.WAITLISTED, EnrollmentStatus.PENDING, EnrollmentStatus.APPROVED]
            ),
        )
        .order_by(Training.starts_at, Training.id)
    )
    result: dict[str, list[TrainingRow]] = {"upcoming": [], "pending": [], "completed": []}
    for row in (TrainingRow(*r) for r in db.execute(query)):
        training, status = row.training, row.my_enrollment_status
        if status == EnrollmentStatus.APPROVED:
            result["completed" if training.ends_at <= now else "upcoming"].append(row)
        elif training.starts_at > now:  # pending or waitlisted, and still decidable
            result["pending"].append(row)
    result["completed"].reverse()  # most recent first
    return result


def rows_by_id(db: Session, training_ids: list[int], viewer: User) -> dict[int, TrainingRow]:
    """Several trainings in one query, by id, with no level filter (the caller decided access)."""
    if not training_ids:
        return {}
    query = _training_rows(viewer).where(Training.id.in_(training_ids))
    return {row.training.id: row for row in (TrainingRow(*r) for r in db.execute(query))}


def get_training(db: Session, training_id: int, viewer: User) -> TrainingRow | None:
    """One training, or None if it doesn't exist or isn't for the viewer's level.

    Past and cancelled trainings of the viewer's level are still found (the Profile
    page links to them). Admins see every training, and trainers the ones they give
    (whatever its levels: they manage its materials there).
    """
    query = _training_rows(viewer).where(Training.id == training_id)
    if not viewer.is_admin:
        query = query.where(or_(_for_level(viewer.level), Training.trainer_id == viewer.id))
    row = db.execute(query).first()
    return TrainingRow(*row) if row else None
