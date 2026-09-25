from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.dependencies import AdminUser, DbSession
from app.errors import ValidationFailed
from app.schemas.report import PersonReportRow, TrainingReportRow
from app.services import reports as service

router = APIRouter(prefix="/admin/reports", tags=["admin: reports"])

ADMIN_ONLY = {401: {"description": "Missing, invalid or expired token"}, 403: {"description": "Admins only"}}


def _trainer(training) -> str:
    if training.trainer is not None:
        return training.trainer.name
    return training.external_trainer_name or "External"


@router.get("/trainings", responses=ADMIN_ONLY)
def training_report(
    db: DbSession,
    _admin: AdminUser,
    starts_from: Annotated[date | None, Query(alias="from")] = None,
    starts_to: Annotated[date | None, Query(alias="to")] = None,
) -> list[TrainingReportRow]:
    """Every training, newest first, with its requests by status and its ratings.
    `from` / `to` (YYYY-MM-DD, both included) filter on the start day in UTC."""
    if starts_from and starts_to and starts_to < starts_from:
        raise ValidationFailed("to", "`to` must not be before `from`", "to_before_from", str(starts_to), location="query")
    return [
        TrainingReportRow(
            id=row.training.id,
            name=row.training.name,
            starts_at=row.training.starts_at,
            ends_at=row.training.ends_at,
            cancelled=row.training.cancelled,
            trainer=_trainer(row.training),
            levels=list(row.training.levels),
            max_seats=row.training.max_seats,
            waitlisted=row.waitlisted,
            pending=row.pending,
            approved=row.approved,
            rejected=row.rejected,
            withdrawn=row.withdrawn,
            average_rating=round(float(row.average_rating), 1) if row.average_rating is not None else None,
            rating_count=row.rating_count,
        )
        for row in service.trainings(db, starts_from, starts_to)
    ]


@router.get("/people", responses=ADMIN_ONLY)
def people_report(db: DbSession, _admin: AdminUser) -> list[PersonReportRow]:
    """Everyone, by name: trainings completed (and their hours), the last one, and approved ones coming up."""
    return [
        PersonReportRow(
            id=row.user.id,
            name=row.user.name,
            email=row.user.email,
            client=row.user.client,
            level=row.user.level,
            team_lead=row.user.team_lead.name if row.user.team_lead else None,
            completed=row.completed,
            completed_hours=round(row.completed_minutes / 60, 1),
            last_completed_at=row.last_completed_at,
            upcoming=row.upcoming,
        )
        for row in service.people(db)
    ]
