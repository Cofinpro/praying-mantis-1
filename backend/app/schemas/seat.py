import datetime as dt

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
