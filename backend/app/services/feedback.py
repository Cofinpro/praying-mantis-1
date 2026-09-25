"""Ratings and comments after a completed training."""

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.errors import Conflict, NotFound
from app.models import Enrollment, EnrollmentStatus, Training, TrainingFeedback, User
from app.schemas.training import FeedbackWrite
from app.services import trainings as training_service


def completed(db: Session, user: User, training: Training) -> bool:
    """Q10's definition: an approved enrollment, the training has ended, and it wasn't cancelled."""
    if training.cancelled or training.ends_at > datetime.now(UTC):
        return False
    status = db.scalar(
        select(Enrollment.status).where(Enrollment.training_id == training.id, Enrollment.user_id == user.id)
    )
    return status == EnrollmentStatus.APPROVED


def _visible_training(db: Session, viewer: User, training_id: int) -> Training:
    # The same access rule as the detail page: admins see all, employees trainings for their level
    row = training_service.get_training(db, training_id, viewer=viewer)
    if row is None:
        raise NotFound("Training not found")
    return row.training


def submit(db: Session, user: User, training_id: int, data: FeedbackWrite) -> TrainingFeedback:
    training = _visible_training(db, user, training_id)
    if not completed(db, user, training):
        raise Conflict("not_completed", "You can rate a training after you've completed it")
    feedback = db.scalar(
        select(TrainingFeedback).where(TrainingFeedback.training_id == training.id, TrainingFeedback.user_id == user.id)
    ) or TrainingFeedback(training_id=training.id, user_id=user.id)
    feedback.rating = data.rating
    feedback.comment = data.comment or None
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return feedback


def summary(db: Session, viewer: User, training_id: int) -> dict:
    """The average for everyone; the comments with names only for admins and the trainer."""
    training = _visible_training(db, viewer, training_id)
    average, count = db.execute(
        select(func.avg(TrainingFeedback.rating), func.count()).where(TrainingFeedback.training_id == training.id)
    ).one()
    mine = db.scalar(
        select(TrainingFeedback).where(TrainingFeedback.training_id == training.id, TrainingFeedback.user_id == viewer.id)
    )
    comments = None
    if viewer.is_admin or training.trainer_id == viewer.id:
        comments = list(
            db.scalars(
                select(TrainingFeedback)
                .where(TrainingFeedback.training_id == training.id)
                .options(joinedload(TrainingFeedback.user).joinedload(User.avatar))
                .order_by(TrainingFeedback.updated_at.desc())
            )
        )
    return {
        "average_rating": round(float(average), 1) if average is not None else None,
        "rating_count": count,
        "mine": mine,
        "can_rate": completed(db, viewer, training),
        "comments": comments,
    }
