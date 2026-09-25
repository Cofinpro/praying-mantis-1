import datetime as dt
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models import Client


class SeatRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    zone: Client


class ReservationCreate(BaseModel):
    seat_id: int
    date: dt.date  # "YYYY-MM-DD"


class ReservationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: dt.date
    seat: SeatRef


class Occupant(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    avatar_url: str | None


class SeatStatus(BaseModel):
    """GET /api/seats?date=: one seat on one day."""

    id: int
    label: str
    zone: Client
    pos_x: int
    pos_y: int
    status: Literal["free", "taken", "mine"]
    taken_by: Occupant | None  # Q12: people can see who took a seat (name only)
    bookable: bool  # free, in my client's zone, and the date is bookable
