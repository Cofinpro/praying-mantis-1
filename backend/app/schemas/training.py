from datetime import UTC, datetime
from typing import Annotated, Self

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
    # Filled in once enrollments exist (BE-3.1); until then always null
    my_enrollment_status: str | None = None

    @field_validator("levels")
    @classmethod
    def sorted_levels(cls, value: list[Level]) -> list[Level]:
        return sorted(value, key=LEVEL_ORDER.index)


class TrainingRead(TrainingSummary):
    description: str
