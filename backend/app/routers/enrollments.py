from fastapi import APIRouter, status

from app.dependencies import CurrentUser, DbSession
from app.schemas.enrollment import EnrollmentRead
from app.services import enrollments as service

router = APIRouter(tags=["enrollments"])


@router.post(
    "/trainings/{training_id}/enrollments",
    status_code=status.HTTP_201_CREATED,
    responses={
        401: {"description": "Missing, invalid or expired token"},
        403: {"description": "Not for your level"},
        404: {"description": "Training not found"},
        409: {
            "description": "already_requested | request_rejected | training_full | "
            "training_started | training_cancelled"
        },
    },
)
def request_to_join(training_id: int, db: DbSession, user: CurrentUser) -> EnrollmentRead:
    """Ask for a seat. Creates a pending enrollment for the team lead (or an admin) to decide."""
    return EnrollmentRead.model_validate(service.request(db, user, training_id))
