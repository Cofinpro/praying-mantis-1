from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.exceptions import RequestValidationError

from app.dependencies import AdminUser, CurrentUser, DbSession
from app.models import Level
from app.schemas.training import TrainingCreate, TrainingRead, TrainingSummary
from app.services import trainings as service

router = APIRouter(prefix="/trainings", tags=["trainings"])

UNAUTHORIZED = {401: {"description": "Missing, invalid or expired token"}}


def _fields(row: service.TrainingRow) -> dict:
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
    return [TrainingSummary.model_validate(_fields(row)) for row in rows]


@router.get(
    "/{training_id}",
    responses=UNAUTHORIZED | {404: {"description": "Not found, or not for your level"}},
)
def get_training(training_id: int, db: DbSession, user: CurrentUser) -> TrainingRead:
    row = service.get_training(db, training_id, viewer=user)
    if row is None:
        # Same 404 for "doesn't exist" and "not for your level": don't reveal which
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training not found")
    return TrainingRead.model_validate(_fields(row))


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    responses=UNAUTHORIZED | {403: {"description": "Admins only"}},
)
def create_training(body: TrainingCreate, db: DbSession, admin: AdminUser) -> TrainingRead:
    """Admin only. Times must be sent in UTC (or with an offset); they come back in UTC."""
    try:
        row = service.create_training(db, body, created_by=admin)
    except service.TrainerNotFound:
        # Same 422 shape as Pydantic's own validation errors, so FE handles one format
        raise RequestValidationError(
            [
                {
                    "type": "trainer_not_found",
                    "loc": ("body", "trainer_id"),
                    "msg": "No user with this id",
                    "input": body.trainer_id,
                }
            ]
        ) from None
    return TrainingRead.model_validate(_fields(row))
