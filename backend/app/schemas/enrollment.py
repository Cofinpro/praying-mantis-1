from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import EnrollmentStatus
from app.schemas.training import TrainingSummary


class EnrollmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    training_id: int
    user_id: int
    status: EnrollmentStatus
    decision_comment: str | None
    requested_at: datetime
    decided_at: datetime | None


class DecisionRequest(BaseModel):
    """Body of approve / reject. The comment is optional and shown to the requester."""

    comment: str | None = Field(default=None, max_length=500)


class Requester(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    avatar_url: str | None


class ApprovalRead(BaseModel):
    """GET /api/approvals: one pending request with who asked and for what."""

    enrollment: EnrollmentRead
    user: Requester
    training: TrainingSummary
