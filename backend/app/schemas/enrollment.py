from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import EnrollmentStatus


class EnrollmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    training_id: int
    user_id: int
    status: EnrollmentStatus
    decision_comment: str | None
    requested_at: datetime
    decided_at: datetime | None
