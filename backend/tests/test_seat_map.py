"""GET /api/seats?date=, with the office clock frozen on Wednesday 14 Oct 2026."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import time_machine

from app.models import Client, Seat, SeatReservation
from tests.conftest import auth_headers
from tests.test_trainings_read import count_queries

FRIDAY = date(2026, 10, 16)


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(datetime(2026, 10, 14, 10, 0, tzinfo=ZoneInfo("Europe/Lisbon")), tick=False):
        yield


@pytest.fixture
def seats(db) -> dict[str, Seat]:
    rows = {
        label: Seat(label=label, zone=zone, pos_x=x, pos_y=y)
        for label, zone, x, y in [
            ("DKB-01", Client.DKB, 0, 0),
            ("DKB-02", Client.DKB, 1, 0),
            ("DKB-06", Client.DKB, 0, 1),
            ("DEKA-01", Client.DEKA, 0, 0),
        ]
    }
    db.add_all(rows.values())
    db.flush()
    return rows


@pytest.fixture
def ana(make_user):
    return make_user(name="Ana Silva", client=Client.DKB)


@pytest.fixture
def book(db):
    def _book(user, seat, day=FRIDAY):
        db.add(SeatReservation(seat_id=seat.id, user_id=user.id, date=day))
        db.flush()

    return _book


def seat_map(client, user, day=FRIDAY):
    return client.get("/api/seats", params={"date": day.isoformat()}, headers=auth_headers(user))


def by_label(response) -> dict[str, dict]:
    return {s["label"]: s for s in response.json()}


def test_every_seat_with_its_status(client, make_user, ana, seats, book):
    rui = make_user(name="Rui Costa", client=Client.DKB)
    book(ana, seats["DKB-01"])
    book(rui, seats["DKB-02"])
    book(rui, seats["DKB-06"], day=FRIDAY + timedelta(days=3))  # another day: doesn't count

    body = by_label(seat_map(client, ana))

    assert body["DKB-01"] == {
        "id": seats["DKB-01"].id, "label": "DKB-01", "zone": "DKB", "pos_x": 0, "pos_y": 0,
        "status": "mine", "taken_by": {"id": ana.id, "name": "Ana Silva"}, "bookable": False,
    }
    assert (body["DKB-02"]["status"], body["DKB-02"]["taken_by"]) == ("taken", {"id": rui.id, "name": "Rui Costa"})
    assert (body["DKB-06"]["status"], body["DKB-06"]["taken_by"]) == ("free", None)


def test_bookable_means_free_and_in_my_zone(client, make_user, ana, seats, book):
    book(make_user(client=Client.DKB), seats["DKB-02"])

    body = by_label(seat_map(client, ana))

    assert {label: s["bookable"] for label, s in body.items()} == {
        "DKB-01": True,  # free, my zone
        "DKB-02": False,  # taken
        "DKB-06": True,
        "DEKA-01": False,  # free, but another client's zone
    }


def test_sorted_by_zone_then_row_then_column(client, ana, seats):
    labels = [s["label"] for s in seat_map(client, ana).json()]

    assert labels == ["DKB-01", "DKB-02", "DKB-06", "DEKA-01"]


@pytest.mark.parametrize(
    ("day", "error_type"),
    [(date(2026, 10, 13), "date_in_past"), (date(2026, 10, 30), "date_too_far"), (date(2026, 10, 17), "date_weekend")],
)
def test_date_rules_are_422_on_the_query_parameter(client, ana, seats, day, error_type):
    response = seat_map(client, ana, day)

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert (error["loc"], error["type"]) == (["query", "date"], error_type)


def test_date_is_required(client, ana):
    assert client.get("/api/seats", headers=auth_headers(ana)).status_code == 422


def test_needs_a_token(client):
    assert client.get("/api/seats", params={"date": "2026-10-16"}).status_code == 401


def test_one_query_however_many_seats(client, db, make_user, ana, seats):
    # 30 more seats, each taken by a different person
    for i in range(30):
        seat = Seat(label=f"VV-{i:02d}", zone=Client.VV, pos_x=i % 5, pos_y=i // 5)
        db.add(seat)
        db.flush()
        db.add(SeatReservation(seat_id=seat.id, user_id=make_user().id, date=FRIDAY))
    db.flush()
    db.expire_all()

    with count_queries(db) as statements:
        response = seat_map(client, ana)

    assert len(response.json()) == 34
    assert len(statements) == 2  # the current user, then the one map query
    assert "LEFT OUTER JOIN seat_reservations" in statements[1]
