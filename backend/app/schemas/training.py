from datetime import UTC, datetime
from typing import Annotated, ClassVar, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.models import Level

# Leading/trailing spaces are stripped before the length checks, so "   " is empty
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10_000)]
TrainerName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]

LEVEL_ORDER = list(Level)


class TrainingCreate(BaseModel):
    """POST /api/trainings. Every agreed F2 validation rule lives here (FE mirrors them)."""

    name: Name
    description: Description
    # AwareDatetime: "2026-10-14T09:00:00" without Z or an offset is rejected,
    # because we couldn't know which time zone it's in
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    max_seats: int = Field(ge=1, le=1000)
    trainer_id: int | None = None  # None = External
    external_trainer_name: TrainerName | None = None
    levels: list[Level] = Field(min_length=1)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def to_utc(cls, value: datetime) -> datetime:
        return value.astimezone(UTC)

    @field_validator("starts_at")
    @classmethod
    def starts_in_the_future(cls, value: datetime) -> datetime:
        if value <= datetime.now(UTC):
            raise ValueError("must be in the future")
        return value

    @field_validator("levels")
    @classmethod
    def unique_and_sorted(cls, value: list[Level]) -> list[Level]:
        return sorted(set(value), key=LEVEL_ORDER.index)

    @model_validator(mode="after")
    def check_cross_field_rules(self) -> Self:
        # These rules need two fields, so they run after every field is valid
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        if self.trainer_id is not None and self.external_trainer_name is not None:
            raise ValueError("Give either trainer_id or external_trainer_name, not both")
        return self


class TrainingUpdate(BaseModel):
    """PATCH /api/trainings/{id}: any subset of TrainingCreate's fields.

    Only fields that were sent are applied (model_dump(exclude_unset=True)), so
    "field missing" (keep it) and "field: null" (clear it) mean different things.
    Rules that involve two fields (end after start, trainer XOR external) are
    checked in the service against the training as it will be after the change.
    """

    name: Name | None = None
    description: Description | None = None
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    max_seats: int | None = Field(default=None, ge=1, le=1000)
    trainer_id: int | None = None
    external_trainer_name: TrainerName | None = None
    levels: list[Level] | None = Field(default=None, min_length=1)

    # Fields that can't be cleared: sending null for them is an error
    REQUIRED_FIELDS: ClassVar = ("name", "description", "starts_at", "ends_at", "max_seats", "levels")

    @field_validator("starts_at", "ends_at")
    @classmethod
    def to_utc(cls, value: datetime | None) -> datetime | None:
        return value.astimezone(UTC) if value is not None else None

    @field_validator("starts_at")
    @classmethod
    def starts_in_the_future(cls, value: datetime | None) -> datetime | None:
        if value is not None and value <= datetime.now(UTC):
            raise ValueError("must be in the future")
        return value

    @field_validator("levels")
    @classmethod
    def unique_and_sorted(cls, value: list[Level] | None) -> list[Level] | None:
        return sorted(set(value), key=LEVEL_ORDER.index) if value is not None else None

    @model_validator(mode="after")
    def required_fields_are_not_null(self) -> Self:
        cleared = [f for f in self.REQUIRED_FIELDS if f in self.model_fields_set and getattr(self, f) is None]
        if cleared:
            raise ValueError(f"These fields can't be null: {', '.join(cleared)}")
        return self


class TrainerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class TrainingSummary(BaseModel):
    """A training in a list. TrainingRead adds the description."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    starts_at: datetime
    ends_at: datetime
    levels: list[Level]
    trainer: TrainerRead | None
    external_trainer_name: str | None
    max_seats: int
    seats_left: int
    cancelled: bool
    # The viewer's own enrollment in this training, if they have one (any status)
    my_enrollment_status: str | None = None
    my_enrollment_id: int | None = None
    # Feedback from people who completed it: average of 1-5 (null until someone rates), how many, and mine
    average_rating: float | None = None
    rating_count: int = 0
    my_rating: int | None = None

    @field_validator("levels")
    @classmethod
    def sorted_levels(cls, value: list[Level]) -> list[Level]:
        return sorted(value, key=LEVEL_ORDER.index)


class TrainingRead(TrainingSummary):
    description: str


class MyEnrollments(BaseModel):
    """GET /api/me/enrollments: the Profile page's three sections."""

    upcoming: list[TrainingSummary]
    pending: list[TrainingSummary]
    completed: list[TrainingSummary]


# --- feedback (ratings after a completed training) ---

FeedbackComment_ = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class FeedbackWrite(BaseModel):
    """PUT /api/trainings/{id}/feedback: rate (1-5) and optionally comment. Again = edit."""

    rating: int = Field(ge=1, le=5)
    comment: FeedbackComment_ | None = None


class FeedbackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rating: int
    comment: str | None
    created_at: datetime
    updated_at: datetime


class FeedbackAuthor(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    avatar_url: str | None


class FeedbackComment(FeedbackRead):
    user: FeedbackAuthor


class FeedbackSummary(BaseModel):
    """GET /api/trainings/{id}/feedback. Everyone who can see the training sees the average.
    The individual comments (with names) only go to admins and the training's trainer."""

    average_rating: float | None
    rating_count: int
    mine: FeedbackRead | None
    can_rate: bool
    comments: list[FeedbackComment] | None
