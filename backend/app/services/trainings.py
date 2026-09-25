from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import ColumnElement, Select, String, literal, null, select
from sqlalchemy.orm import Session, joinedload

from app.models import Level, Training, TrainingLevel, User
from app.schemas.training import TrainingCreate


@dataclass
class TrainingRow:
    """A training plus the values computed for one viewer, all from the same query."""

    training: Training
    seats_left: int
    my_enrollment_status: str | None


class TrainerNotFound(Exception):
    """trainer_id doesn't match any user."""


def create_training(db: Session, data: TrainingCreate, created_by: User) -> TrainingRow:
    if data.trainer_id is not None and db.get(User, data.trainer_id) is None:
        raise TrainerNotFound(data.trainer_id)

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


# --- reading ---
#
# seats_left and my_enrollment_status are columns of the SELECT itself, so a list
# of 50 trainings is still one query (plus one for all their levels), never 50.
# Enrollments don't exist yet (BE-3.1). Until then these are placeholders:
#   seats_left           = max_seats             -> becomes max_seats - COUNT(approved)
#   my_enrollment_status = NULL                  -> becomes the viewer's enrollment status
# BE-3.1 only has to replace these two functions.


def seats_left_column() -> ColumnElement[int]:
    return Training.max_seats.label("seats_left")


def my_enrollment_status_column(viewer: User) -> ColumnElement[str | None]:
    return null().cast(String(32)).label("my_enrollment_status")


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
