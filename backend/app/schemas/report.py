from datetime import datetime

from pydantic import BaseModel

from app.models import Client, Level


class TrainingReportRow(BaseModel):
    """One training on the admin Reports page: its requests by status, and its ratings."""

    id: int
    name: str
    starts_at: datetime
    ends_at: datetime
    cancelled: bool
    trainer: str  # the user's name, the external trainer's name, or "External"
    levels: list[Level]
    max_seats: int
    # Enrollments by status (every request ever made, withdrawn ones included)
    waitlisted: int
    pending: int
    approved: int
    rejected: int
    withdrawn: int
    average_rating: float | None
    rating_count: int


class PersonReportRow(BaseModel):
    """One person: the trainings they completed (approved, ended, not cancelled) and have coming up."""

    id: int
    name: str
    email: str
    client: Client
    level: Level
    team_lead: str | None
    completed: int
    completed_hours: float
    last_completed_at: datetime | None
    upcoming: int  # approved, not ended yet, not cancelled
