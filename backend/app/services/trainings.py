from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import ColumnElement, Select, func, select
from sqlalchemy.orm import Session, joinedload

from app.errors import Conflict, ValidationFailed
from app.models import Enrollment, EnrollmentStatus, Level, Training, TrainingLevel, User
from app.services import enrollments as enrollment_service
from app.schemas.training import TrainingCreate, TrainingUpdate


@dataclass
class TrainingRow:
    """A training plus the values computed for one viewer, all from the same query."""

    training: Training
    seats_left: int
    my_enrollment_status: str | None


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

    for field, value in data.items():
        setattr(training, field, value)  # "levels" goes through the association proxy
    db.commit()
    return get_training(db, training.id, viewer=viewer)


def cancel_training(db: Session, training_id: int, viewer: User) -> TrainingRow | None:
    """Soft delete: sets cancelled_at, the row stays. None if the training doesn't exist."""
    training = _get_for_change(db, training_id)
    if training is None:
        return None
    if training.starts_at <= datetime.now(UTC):
        raise Conflict("training_started", "A training that has already started can't be cancelled")

    training.cancelled_at = datetime.now(UTC)
    # TODO(BE-4.1): notify everyone with a pending or approved enrollment, in this
    # same transaction (see decisions.md, "Notifications")
    db.commit()
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


def _training_rows(viewer: User) -> Select:
    return select(
        Training,
        seats_left_column(),
        my_enrollment_status_column(viewer),
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


def get_training(db: Session, training_id: int, viewer: User) -> TrainingRow | None:
    """One training, or None if it doesn't exist or isn't for the viewer's level.

    Past and cancelled trainings of the viewer's level are still found (the Profile
    page links to them). Admins see every training.
    """
    query = _training_rows(viewer).where(Training.id == training_id)
    if not viewer.is_admin:
        query = query.where(_for_level(viewer.level))
    row = db.execute(query).first()
    return TrainingRow(*row) if row else None
