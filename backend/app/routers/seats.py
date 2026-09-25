from fastapi import APIRouter, Response, status

from app.dependencies import CurrentUser, DbSession
from app.schemas.seat import ReservationCreate, ReservationRead
from app.services import seats as service

router = APIRouter(tags=["seats"])

UNAUTHORIZED = {401: {"description": "Missing, invalid or expired token"}}


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
