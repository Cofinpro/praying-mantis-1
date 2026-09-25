from fastapi import APIRouter, status

from app.dependencies import CurrentUser, DbSession
from app.routers.trainings import training_fields
from app.schemas.enrollment import ApprovalRead, DecisionRequest, EnrollmentRead
from app.schemas.training import TrainingSummary
from app.services import enrollments as service
from app.services import trainings as training_service

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


DECISION_RESPONSES = {
    401: {"description": "Missing, invalid or expired token"},
    403: {"description": "Not one of your reports"},
    404: {"description": "Enrollment not found"},
    409: {"description": "not_pending | training_full | training_started | training_cancelled"},
}


@router.get("/approvals", responses={401: {"description": "Missing, invalid or expired token"}})
def list_approvals(db: DbSession, user: CurrentUser) -> list[ApprovalRead]:
    """Pending requests I can decide: my reports', plus (for admins) people without a team lead.
    Only upcoming, uncancelled trainings. Oldest request first. Empty for everyone else."""
    enrollments = service.pending_for(db, user)
    rows = training_service.rows_by_id(db, list({e.training_id for e in enrollments}), viewer=user)
    return [
        ApprovalRead(
            enrollment=EnrollmentRead.model_validate(e),
            user=e.user,
            training=TrainingSummary.model_validate(training_fields(rows[e.training_id])),
        )
        for e in enrollments
    ]


@router.post("/enrollments/{enrollment_id}/approve", responses=DECISION_RESPONSES)
def approve(
    enrollment_id: int, db: DbSession, user: CurrentUser, body: DecisionRequest | None = None
) -> EnrollmentRead:
    """Approve a pending request if the training still has a seat."""
    comment = body.comment if body else None
    return EnrollmentRead.model_validate(service.approve(db, user, enrollment_id, comment))


@router.post("/enrollments/{enrollment_id}/reject", responses=DECISION_RESPONSES)
def reject(
    enrollment_id: int, db: DbSession, user: CurrentUser, body: DecisionRequest | None = None
) -> EnrollmentRead:
    """Reject a pending request, optionally with a comment. The user can't ask again."""
    comment = body.comment if body else None
    return EnrollmentRead.model_validate(service.reject(db, user, enrollment_id, comment))


@router.post(
    "/enrollments/{enrollment_id}/withdraw",
    responses={
        401: {"description": "Missing, invalid or expired token"},
        403: {"description": "Not your enrollment"},
        404: {"description": "Enrollment not found"},
        409: {"description": "not_withdrawable | training_started"},
    },
)
def withdraw(enrollment_id: int, db: DbSession, user: CurrentUser) -> EnrollmentRead:
    """Withdraw my own pending or approved enrollment, before the training starts."""
    return EnrollmentRead.model_validate(service.withdraw(db, user, enrollment_id))
