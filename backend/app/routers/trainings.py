from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.dependencies import AdminUser, CurrentUser, DbSession
from app.models import Level
from app.schemas.training import (
    FeedbackRead,
    FeedbackSummary,
    FeedbackWrite,
    MyEnrollments,
    TrainingCreate,
    TrainingRead,
    TrainingSummary,
    TrainingUpdate,
)
from app.services import feedback as feedback_service
from app.services import trainings as service

router = APIRouter(prefix="/trainings", tags=["trainings"])

UNAUTHORIZED = {401: {"description": "Missing, invalid or expired token"}}
ADMIN_ONLY = UNAUTHORIZED | {403: {"description": "Admins only"}}
NOT_FOUND = {404: {"description": "Training not found"}}
CONFLICT = {409: {"description": 'Business rule, e.g. {"detail": {"code": "training_cancelled", ...}}'}}


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training not found")


def training_fields(row: service.TrainingRow) -> dict:
    training = row.training
    return {
        "id": training.id,
        "name": training.name,
        "description": training.description,
        "starts_at": training.starts_at,
        "ends_at": training.ends_at,
        "levels": list(training.levels),
        "trainer": training.trainer,
        "external_trainer_name": training.external_trainer_name,
        "max_seats": training.max_seats,
        "seats_left": row.seats_left,
        "cancelled": training.cancelled,
        "my_enrollment_status": row.my_enrollment_status,
        "my_enrollment_id": row.my_enrollment_id,
        # MySQL's AVG gives a Decimal: one decimal place is plenty for "★ 4.3"
        "average_rating": round(float(row.average_rating), 1) if row.average_rating is not None else None,
        "rating_count": row.rating_count,
        "my_rating": row.my_rating,
    }


@router.get("", responses=UNAUTHORIZED)
def list_trainings(
    db: DbSession,
    user: CurrentUser,
    level: Annotated[
        Level | None, Query(description="Admins only; ignored for everyone else")
    ] = None,
) -> list[TrainingSummary]:
    """Employees: upcoming, not cancelled trainings for their own level, soonest first.
    Admins: every training (past and cancelled too), optionally filtered by level."""
    rows = service.list_trainings(db, viewer=user, level=level)
    return [TrainingSummary.model_validate(training_fields(row)) for row in rows]


@router.get(
    "/{training_id}",
    responses=UNAUTHORIZED | {404: {"description": "Not found, or not for your level"}},
)
def get_training(training_id: int, db: DbSession, user: CurrentUser) -> TrainingRead:
    row = service.get_training(db, training_id, viewer=user)
    if row is None:
        # Same 404 for "doesn't exist" and "not for your level": don't reveal which
        raise _not_found()
    return TrainingRead.model_validate(training_fields(row))


@router.post("", status_code=status.HTTP_201_CREATED, responses=ADMIN_ONLY)
def create_training(body: TrainingCreate, db: DbSession, admin: AdminUser) -> TrainingRead:
    """Admin only. Times must be sent in UTC (or with an offset); they come back in UTC.
    An unknown trainer_id is a 422 like any other validation error."""
    row = service.create_training(db, body, created_by=admin)
    return TrainingRead.model_validate(training_fields(row))


@router.patch("/{training_id}", responses=ADMIN_ONLY | NOT_FOUND | CONFLICT)
def update_training(
    training_id: int, body: TrainingUpdate, db: DbSession, admin: AdminUser
) -> TrainingRead:
    """Admin only. Send only the fields to change; `null` clears the trainer fields.
    409 if the training is cancelled, or max_seats would drop below the approved count."""
    row = service.update_training(db, training_id, body, viewer=admin)
    if row is None:
        raise _not_found()
    return TrainingRead.model_validate(training_fields(row))


@router.post("/{training_id}/cancel", responses=ADMIN_ONLY | NOT_FOUND | CONFLICT)
def cancel_training(training_id: int, db: DbSession, admin: AdminUser) -> TrainingRead:
    """Admin only. A soft delete: the training stays, marked cancelled.
    409 if it's already cancelled or has already started."""
    row = service.cancel_training(db, training_id, viewer=admin)
    if row is None:
        raise _not_found()
    return TrainingRead.model_validate(training_fields(row))


@router.put(
    "/{training_id}/feedback",
    responses=UNAUTHORIZED | {404: {"description": "Training not found"}, 409: {"description": "not_completed"}},
)
def rate_training(training_id: int, body: FeedbackWrite, db: DbSession, user: CurrentUser) -> FeedbackRead:
    """Rate (1-5) and optionally comment on a training I completed. Sending it again edits it."""
    return FeedbackRead.model_validate(feedback_service.submit(db, user, training_id, body))


@router.get("/{training_id}/feedback", responses=UNAUTHORIZED | {404: {"description": "Training not found"}})
def training_feedback(training_id: int, db: DbSession, user: CurrentUser) -> FeedbackSummary:
    """The average and count for everyone, my own rating, and (admins and the trainer only) all comments."""
    return FeedbackSummary.model_validate(feedback_service.summary(db, user, training_id))


# Mounted without the /trainings prefix: GET /api/me/enrollments
me_router = APIRouter(prefix="/me", tags=["trainings"])


@me_router.get("/enrollments", responses=UNAUTHORIZED)
def my_enrollments(db: DbSession, user: CurrentUser) -> MyEnrollments:
    """My upcoming (approved), pending and completed trainings, for the Profile page."""
    sections = service.my_enrollments(db, viewer=user)
    return MyEnrollments(
        **{
            name: [TrainingSummary.model_validate(training_fields(row)) for row in rows]
            for name, rows in sections.items()
        }
    )
