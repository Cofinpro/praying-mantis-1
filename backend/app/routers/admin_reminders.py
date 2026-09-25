from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from app.dependencies import AdminUser, DbSession
from app.email import send_email
from app.services import reminders

router = APIRouter(prefix="/admin/reminders", tags=["admin"])


class ReminderRunRead(BaseModel):
    """How many reminders this run sent (0 and 0 = nothing was due)."""

    trainings: int
    seats: int


@router.post(
    "/run",
    responses={401: {"description": "Missing, invalid or expired token"}, 403: {"description": "Admins only"}},
)
def run_reminders(admin: AdminUser, db: DbSession, background: BackgroundTasks) -> ReminderRunRead:
    """Send every due reminder now, instead of waiting for the next loop turn. Safe to repeat."""
    run = reminders.send_due(db)
    for email in run.emails:
        background.add_task(send_email, email)
    return ReminderRunRead(trainings=run.trainings, seats=run.seats)
