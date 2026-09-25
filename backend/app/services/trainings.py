from sqlalchemy.orm import Session

from app.models import Training, User
from app.schemas.training import TrainingCreate


class TrainerNotFound(Exception):
    """trainer_id doesn't match any user."""


def create_training(db: Session, data: TrainingCreate, created_by: User) -> Training:
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
    db.refresh(training)
    return training


def seats_left(training: Training) -> int:
    # No enrollments yet (BE-3.1): every seat is free
    return training.max_seats
