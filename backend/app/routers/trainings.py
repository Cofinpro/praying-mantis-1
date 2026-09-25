from fastapi import APIRouter, status
from fastapi.exceptions import RequestValidationError

from app.dependencies import AdminUser, DbSession
from app.models import Training
from app.schemas.training import TrainingCreate, TrainingRead
from app.services import trainings as service

router = APIRouter(prefix="/trainings", tags=["trainings"])


def to_read(training: Training) -> TrainingRead:
    return TrainingRead.model_validate(
        {
            "id": training.id,
            "name": training.name,
            "description": training.description,
            "starts_at": training.starts_at,
            "ends_at": training.ends_at,
            "levels": list(training.levels),
            "trainer": training.trainer,
            "external_trainer_name": training.external_trainer_name,
            "max_seats": training.max_seats,
            "seats_left": service.seats_left(training),
            "cancelled": training.cancelled,
        }
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    responses={
        401: {"description": "Missing, invalid or expired token"},
        403: {"description": "Admins only"},
    },
)
def create_training(body: TrainingCreate, db: DbSession, admin: AdminUser) -> TrainingRead:
    """Admin only. Times must be sent in UTC (or with an offset); they come back in UTC."""
    try:
        training = service.create_training(db, body, created_by=admin)
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
    return to_read(training)
