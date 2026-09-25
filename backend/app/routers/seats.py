import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.dependencies import CurrentUser, DbSession
from app.schemas.seat import Occupant, ReservationCreate, ReservationRead, SeatStatus
from app.services import seats as service

router = APIRouter(tags=["seats"])

UNAUTHORIZED = {401: {"description": "Missing, invalid or expired token"}}


@router.get(
    "/seats",
    responses=UNAUTHORIZED | {422: {"description": "date_in_past | date_too_far | date_weekend"}},
)
def seat_map(
    db: DbSession, user: CurrentUser, date: Annotated[dt.date, Query(description="YYYY-MM-DD")]
) -> list[SeatStatus]:
    """Every seat's status on a day, sorted by zone, row and column."""
    return [
        SeatStatus(
            id=s.seat.id,
            label=s.seat.label,
            zone=s.seat.zone,
            pos_x=s.seat.pos_x,
            pos_y=s.seat.pos_y,
            status=s.status,
            taken_by=Occupant.model_validate(s.taken_by) if s.taken_by else None,
            bookable=s.bookable,
        )
        for s in service.seat_map(db, user, date)
    ]


@router.post(
    "/reservations",
    status_code=status.HTTP_201_CREATED,
    responses=UNAUTHORIZED
    | {
        403: {"description": "Another client's zone"},
        404: {"description": "Seat not found"},
        409: {"description": "seat_taken (someone was faster) | already_reserved"},
        422: {"description": "date_in_past | date_too_far | date_weekend"},
    },
)
def reserve(body: ReservationCreate, db: DbSession, user: CurrentUser) -> ReservationRead:
    """Reserve a seat for a day. If I already have a seat that day, it moves to this one."""
    return ReservationRead.model_validate(service.reserve(db, user, body.seat_id, body.date))


@router.get("/reservations/me", responses=UNAUTHORIZED)
def my_reservations(db: DbSession, user: CurrentUser) -> list[ReservationRead]:
    """My reservations from today on, soonest first."""
    return [ReservationRead.model_validate(r) for r in service.my_upcoming(db, user)]


@router.delete(
    "/reservations/{reservation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=UNAUTHORIZED
    | {
        403: {"description": "Not yours"},
        404: {"description": "Reservation not found"},
        409: {"description": "reservation_in_past"},
    },
)
def cancel(reservation_id: int, db: DbSession, user: CurrentUser) -> Response:
    service.cancel(db, user, reservation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
