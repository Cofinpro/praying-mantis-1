"""Seat reservations. Optimistic concurrency: the UNIQUE constraints decide who wins.

Compare approvals (services/enrollments.py), which lock the training row
(pessimistic). Here there's nothing to count, only "is this (seat, day) free?",
which is exactly what UNIQUE (seat_id, date) answers, atomically, in the database.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, case, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.models import Client, Seat, SeatReservation, User

ZONE_ORDER = case({zone.value: i for i, zone in enumerate(Client)}, value=Seat.zone)

# The constraint names, to tell "seat taken" from "you already have one" (naming convention)
SEAT_TAKEN_CONSTRAINT = "uq_seat_reservations_seat_id"


def office_today() -> date:
    """Today's date in the office (Q14's "no past days" is about the office calendar)."""
    return datetime.now(ZoneInfo(settings.office_timezone)).date()


def check_booking_date(day: date, location: str = "body") -> None:
    """Q14: not in the past, at most booking_days_ahead days ahead, and not on a weekend."""
    today = office_today()
    value = day.isoformat()
    if day < today:
        raise ValidationFailed("date", "That day is in the past", "date_in_past", value, location)
    if day > today + timedelta(days=settings.booking_days_ahead):
        raise ValidationFailed(
            "date",
            f"Seats can be booked at most {settings.booking_days_ahead} days ahead",
            "date_too_far",
            value,
            location,
        )
    if day.weekday() >= 5:
        raise ValidationFailed("date", "The office is closed at weekends", "date_weekend", value, location)


@dataclass
class SeatOnDay:
    seat: Seat
    status: str  # "free" | "taken" | "mine"
    taken_by: User | None
    bookable: bool


def seat_map(db: Session, viewer: User, day: date) -> list[SeatOnDay]:
    """Every seat's status on `day`, in ONE query: seats LEFT JOIN that day's reservations
    LEFT JOIN their users. A free seat simply has NULLs on the right-hand side."""
    check_booking_date(day, location="query")
    query = (
        select(Seat, User)
        .outerjoin(SeatReservation, and_(SeatReservation.seat_id == Seat.id, SeatReservation.date == day))
        .outerjoin(User, User.id == SeatReservation.user_id)
        # Zones in the Client enum's order (DKB, Deka, VV, DBIS, UNION), not alphabetical:
        # CASE zone WHEN 'DKB' THEN 0 WHEN 'Deka' THEN 1 ... END
        .order_by(ZONE_ORDER, Seat.pos_y, Seat.pos_x)
        # The occupant's avatar row joins into the same query (still ONE query); its bytes are deferred
        .options(joinedload(User.avatar))
    )
    result = []
    for seat, occupant in db.execute(query):
        if occupant is None:
            status = "free"
        elif occupant.id == viewer.id:
            status = "mine"
        else:
            status = "taken"
        # The date is already valid here (else 422), so bookable = free and in my zone
        bookable = status == "free" and seat.zone == viewer.client
        result.append(SeatOnDay(seat=seat, status=status, taken_by=occupant, bookable=bookable))
    return result


def reserve(db: Session, user: User, seat_id: int, day: date) -> SeatReservation:
    """Reserves the seat for the day. If the user already has a seat that day, it's moved."""
    check_booking_date(day)
    seat = db.get(Seat, seat_id)
    if seat is None:
        raise NotFound("Seat not found")
    if seat.zone != user.client:
        raise Forbidden("You can only book seats in your own client's zone")

    mine = db.scalar(select(SeatReservation).where(SeatReservation.user_id == user.id, SeatReservation.date == day))
    if mine is not None and mine.seat_id == seat.id:
        return mine  # already mine: nothing to do

    try:
        if mine is not None:
            # Move = delete + insert in one transaction. The DELETE runs first (flush),
            # so UNIQUE (user_id, date) doesn't see two rows. If the INSERT then fails,
            # the rollback puts the old reservation back.
            db.delete(mine)
            db.flush()
        reservation = SeatReservation(seat_id=seat.id, user_id=user.id, date=day)
        db.add(reservation)
        db.commit()
    except IntegrityError as error:
        db.rollback()
        if SEAT_TAKEN_CONSTRAINT in str(error.orig):
            raise Conflict("seat_taken", "Sorry, someone else just took this seat") from None
        # UNIQUE (user_id, date): the same user booked twice at the same moment (two tabs)
        raise Conflict("already_reserved", "You already have a seat that day") from None
    db.refresh(reservation)
    return reservation


def my_upcoming(db: Session, user: User) -> list[SeatReservation]:
    """My reservations from today on, soonest first."""
    return list(
        db.scalars(
            select(SeatReservation)
            .where(SeatReservation.user_id == user.id, SeatReservation.date >= office_today())
            .options(joinedload(SeatReservation.seat))
            .order_by(SeatReservation.date)
        )
    )


def cancel(db: Session, user: User, reservation_id: int) -> None:
    """Deletes my reservation. Today's can still be cancelled; past ones are history."""
    reservation = db.get(SeatReservation, reservation_id)
    if reservation is None:
        raise NotFound("Reservation not found")
    if reservation.user_id != user.id:
        raise Forbidden("You can only cancel your own reservations")
    if reservation.date < office_today():
        raise Conflict("reservation_in_past", "Past reservations can't be cancelled")
    db.execute(delete(SeatReservation).where(SeatReservation.id == reservation.id))
    db.commit()
