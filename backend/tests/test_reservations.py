"""Seat reservations, with the office clock frozen on Wednesday 14 Oct 2026."""

import threading
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import time_machine
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.errors import Conflict
from app.models import Client, Seat, SeatReservation, User
from app.services import seats as service
from tests.conftest import auth_headers

LISBON = ZoneInfo("Europe/Lisbon")
TODAY = date(2026, 10, 14)  # a Wednesday
FRIDAY, SATURDAY, NEXT_MONDAY = date(2026, 10, 16), date(2026, 10, 17), date(2026, 10, 19)


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(datetime(2026, 10, 14, 10, 0, tzinfo=LISBON), tick=False):
        yield


@pytest.fixture
def seats(db) -> dict[str, Seat]:
    rows = {
        label: Seat(label=label, zone=zone, pos_x=x, pos_y=0)
        for label, zone, x in [("DKB-01", Client.DKB, 0), ("DKB-02", Client.DKB, 1), ("DEKA-01", Client.DEKA, 0)]
    }
    db.add_all(rows.values())
    db.flush()
    return rows


@pytest.fixture
def ana(make_user):
    return make_user(name="Ana Silva", client=Client.DKB)


@pytest.fixture
def rui(make_user):
    return make_user(name="Rui Costa", client=Client.DKB)


def reserve(client, user, seat, day):
    return client.post("/api/reservations", json={"seat_id": seat.id, "date": day.isoformat()}, headers=auth_headers(user))


def count(db, **filters) -> int:
    query = select(func.count()).select_from(SeatReservation)
    for column, value in filters.items():
        query = query.where(getattr(SeatReservation, column) == value)
    return db.scalar(query)


# --- reserving ---


def test_reserve_a_free_seat(client, db, ana, seats):
    response = reserve(client, ana, seats["DKB-01"], FRIDAY)

    assert response.status_code == 201
    assert response.json() == {
        "id": response.json()["id"],
        "date": "2026-10-16",
        "seat": {"id": seats["DKB-01"].id, "label": "DKB-01", "zone": "DKB"},
    }
    assert count(db, user_id=ana.id) == 1


def test_another_clients_zone_is_403(client, ana, seats):
    response = reserve(client, ana, seats["DEKA-01"], FRIDAY)

    assert response.status_code == 403
    assert response.json() == {"detail": "You can only book seats in your own client's zone"}


def test_unknown_seat_is_404(client, ana):
    response = client.post("/api/reservations", json={"seat_id": 999_999, "date": "2026-10-16"}, headers=auth_headers(ana))

    assert response.status_code == 404


@pytest.mark.parametrize(
    ("day", "error_type"),
    [
        (TODAY - timedelta(days=1), "date_in_past"),
        (TODAY + timedelta(days=15), "date_too_far"),
        (SATURDAY, "date_weekend"),
        (SATURDAY + timedelta(days=1), "date_weekend"),
    ],
)
def test_date_rules_are_422(client, ana, seats, day, error_type):
    response = reserve(client, ana, seats["DKB-01"], day)

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert (error["loc"], error["type"]) == (["body", "date"], error_type)


@pytest.mark.parametrize("day", [TODAY, TODAY + timedelta(days=14)])  # both ends are allowed
def test_today_and_two_weeks_ahead_are_bookable(client, ana, seats, day):
    assert reserve(client, ana, seats["DKB-01"], day).status_code == 201


def test_today_follows_the_office_time_zone(client, ana, seats):
    # 23:30 UTC on Wednesday is already Thursday 00:30 in Lisbon (summer time), so Wednesday is the past
    with time_machine.travel(datetime(2026, 10, 14, 23, 30, tzinfo=UTC), tick=False):
        assert reserve(client, ana, seats["DKB-01"], TODAY).json()["detail"][0]["type"] == "date_in_past"


def test_bad_date_format_is_422(client, ana, seats):
    response = client.post("/api/reservations", json={"seat_id": seats["DKB-01"].id, "date": "16/10/2026"}, headers=auth_headers(ana))

    assert response.status_code == 422


# --- two users, same seat, same day ---


def test_a_taken_seat_is_409_seat_taken(client, db, ana, rui, seats):
    reserve(client, ana, seats["DKB-01"], FRIDAY)

    response = reserve(client, rui, seats["DKB-01"], FRIDAY)

    assert response.status_code == 409
    assert response.json()["detail"] == {"code": "seat_taken", "message": "Sorry, someone else just took this seat"}
    assert count(db, seat_id=seats["DKB-01"].id, date=FRIDAY) == 1


def test_the_same_seat_on_another_day_is_fine(client, ana, rui, seats):
    reserve(client, ana, seats["DKB-01"], FRIDAY)

    assert reserve(client, rui, seats["DKB-01"], NEXT_MONDAY).status_code == 201


# --- moving (one seat per person per day) ---


def test_reserving_another_seat_the_same_day_moves_it(client, db, ana, seats):
    reserve(client, ana, seats["DKB-01"], FRIDAY)

    response = reserve(client, ana, seats["DKB-02"], FRIDAY)

    assert response.status_code == 201
    assert response.json()["seat"]["label"] == "DKB-02"
    assert count(db, user_id=ana.id, date=FRIDAY) == 1
    assert count(db, seat_id=seats["DKB-01"].id, date=FRIDAY) == 0  # the old seat is free again


def test_moving_to_a_taken_seat_keeps_the_old_one(client, db, ana, rui, seats):
    reserve(client, ana, seats["DKB-01"], FRIDAY)
    reserve(client, rui, seats["DKB-02"], FRIDAY)

    response = reserve(client, ana, seats["DKB-02"], FRIDAY)

    assert response.json()["detail"]["code"] == "seat_taken"
    db.expire_all()
    [mine] = db.scalars(select(SeatReservation).where(SeatReservation.user_id == ana.id)).all()
    assert mine.seat_id == seats["DKB-01"].id  # the move was rolled back as a whole


def test_reserving_my_own_seat_again_changes_nothing(client, ana, seats):
    first = reserve(client, ana, seats["DKB-01"], FRIDAY).json()

    again = reserve(client, ana, seats["DKB-01"], FRIDAY)

    assert (again.status_code, again.json()["id"]) == (201, first["id"])


# --- GET /api/reservations/me ---


def test_my_reservations_are_upcoming_only_soonest_first(client, db, ana, rui, seats):
    db.add(SeatReservation(seat_id=seats["DKB-01"].id, user_id=ana.id, date=TODAY - timedelta(days=1)))
    db.flush()
    reserve(client, ana, seats["DKB-01"], NEXT_MONDAY)
    reserve(client, ana, seats["DKB-02"], TODAY)
    reserve(client, rui, seats["DKB-01"], FRIDAY)  # not mine

    body = client.get("/api/reservations/me", headers=auth_headers(ana)).json()

    assert [(r["date"], r["seat"]["label"]) for r in body] == [("2026-10-14", "DKB-02"), ("2026-10-19", "DKB-01")]


# --- DELETE /api/reservations/{id} ---


def test_cancel_my_reservation(client, db, ana, seats):
    reservation_id = reserve(client, ana, seats["DKB-01"], FRIDAY).json()["id"]

    assert client.delete(f"/api/reservations/{reservation_id}", headers=auth_headers(ana)).status_code == 204
    assert count(db, user_id=ana.id) == 0


def test_cancel_todays_reservation(client, ana, seats):
    reservation_id = reserve(client, ana, seats["DKB-01"], TODAY).json()["id"]

    assert client.delete(f"/api/reservations/{reservation_id}", headers=auth_headers(ana)).status_code == 204


def test_cant_cancel_someone_elses(client, ana, rui, seats):
    reservation_id = reserve(client, ana, seats["DKB-01"], FRIDAY).json()["id"]

    response = client.delete(f"/api/reservations/{reservation_id}", headers=auth_headers(rui))

    assert response.status_code == 403


def test_cant_cancel_a_past_one(client, db, ana, seats):
    past = SeatReservation(seat_id=seats["DKB-01"].id, user_id=ana.id, date=TODAY - timedelta(days=1))
    db.add(past)
    db.flush()

    response = client.delete(f"/api/reservations/{past.id}", headers=auth_headers(ana))

    assert (response.status_code, response.json()["detail"]["code"]) == (409, "reservation_in_past")


def test_cancel_unknown_is_404(client, ana):
    assert client.delete("/api/reservations/999999", headers=auth_headers(ana)).status_code == 404


def test_everything_needs_a_token(client):
    assert client.post("/api/reservations", json={"seat_id": 1, "date": "2026-10-16"}).status_code == 401
    assert client.get("/api/reservations/me").status_code == 401
    assert client.delete("/api/reservations/1").status_code == 401


# --- the real race: two connections insert at the same moment ---


@pytest.fixture
def committed(engine):
    with Session(engine, expire_on_commit=False) as db:
        seat = Seat(label="RACE-01", zone=Client.DKB, pos_x=99, pos_y=99)
        users = [User(name=f"Racer {i}", email=f"racer{i}@race.test", password_hash="x", client=Client.DKB,
                      level="junior") for i in range(2)]
        db.add_all([seat, *users])
        db.commit()
    yield seat, users
    with Session(engine) as db:
        db.execute(delete(SeatReservation).where(SeatReservation.seat_id == seat.id))
        db.execute(delete(Seat).where(Seat.id == seat.id))
        db.execute(delete(User).where(User.email.like("%@race.test")))
        db.commit()


def test_two_users_click_the_same_seat_at_the_same_moment(engine, committed):
    seat, users = committed
    start = threading.Barrier(2)
    results: list[str] = []

    def click(user):
        with Session(engine) as db:
            start.wait()
            try:
                service.reserve(db, user, seat.id, FRIDAY)
                results.append("reserved")
            except Conflict as conflict:
                results.append(conflict.code)

    threads = [threading.Thread(target=click, args=(user,)) for user in users]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert sorted(results) == ["reserved", "seat_taken"]
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(SeatReservation).where(SeatReservation.seat_id == seat.id)) == 1
