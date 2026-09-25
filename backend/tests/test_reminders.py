"""Reminders the day before, with the clock frozen on Wednesday 14 Oct 2026, 10:00 in Lisbon."""

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import time_machine
from sqlalchemy import select

from app.email import Email
from app.models import (
    Client,
    Enrollment,
    EnrollmentStatus,
    Level,
    Notification,
    NotificationType,
    Seat,
    SeatReservation,
    Training,
)
from app.services import reminders
from tests.conftest import auth_headers

LISBON = ZoneInfo("Europe/Lisbon")
NOW = datetime(2026, 10, 14, 10, 0, tzinfo=LISBON)  # a Wednesday
THURSDAY, FRIDAY, NEXT_MONDAY = date(2026, 10, 15), date(2026, 10, 16), date(2026, 10, 19)


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(NOW, tick=False) as traveller:
        yield traveller


@pytest.fixture
def admin(make_user):
    return make_user(name="Alex Admin", is_admin=True, level=Level.SENIOR_ARCHITECT)


@pytest.fixture
def joao(make_user):
    return make_user(name="João Silva", email="joao@test.local")


@pytest.fixture
def make_training(db, admin):
    def _make(starts_in: timedelta, **fields) -> Training:
        starts_at = NOW.astimezone(UTC) + starts_in
        training = Training(
            name=fields.pop("name", "Git basics"),
            description="About it",
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=2),
            max_seats=5,
            created_by=admin,
            levels=[Level.JUNIOR],
            **fields,
        )
        db.add(training)
        db.flush()
        return training

    return _make


def enroll(db, user, training, status=EnrollmentStatus.APPROVED) -> Enrollment:
    enrollment = Enrollment(user_id=user.id, training_id=training.id, status=status)
    db.add(enrollment)
    db.flush()
    return enrollment


def reminders_of(db, user) -> list[tuple[NotificationType, str]]:
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.id))
    return [(n.type, n.message) for n in rows]


# --- trainings ---


def test_an_approved_training_starting_within_a_day_is_reminded_once(db, joao, make_training):
    enroll(db, joao, make_training(timedelta(hours=23), name="Intro to FastAPI"))  # tomorrow 09:00 in Lisbon

    first = reminders.send_due(db)
    again = reminders.send_due(db)

    assert (first.trainings, again.trainings) == (1, 0)
    assert reminders_of(db, joao) == [
        (NotificationType.TRAINING_REMINDER, "Reminder: Intro to FastAPI starts tomorrow at 09:00")
    ]
    assert first.emails == [
        Email(
            to="joao@test.local",
            subject="Reminder: Intro to FastAPI starts tomorrow at 09:00",
            body=first.emails[0].body,
        )
    ]


def test_later_trainings_wait_until_they_are_a_day_away(db, joao, make_training, frozen_clock):
    enroll(db, joao, make_training(timedelta(hours=30)))
    assert reminders.send_due(db).trainings == 0

    frozen_clock.shift(timedelta(hours=7))
    assert reminders.send_due(db).trainings == 1


@pytest.mark.parametrize(
    "status", [EnrollmentStatus.PENDING, EnrollmentStatus.WAITLISTED, EnrollmentStatus.WITHDRAWN]
)
def test_only_approved_people_are_reminded(db, joao, make_training, status):
    enroll(db, joao, make_training(timedelta(hours=5)), status)

    assert reminders.send_due(db).trainings == 0


def test_cancelled_or_started_trainings_are_not_reminded(db, joao, make_user, make_training):
    enroll(db, joao, make_training(timedelta(hours=5), cancelled_at=NOW))
    enroll(db, make_user(), make_training(-timedelta(minutes=30)))

    assert reminders.send_due(db).trainings == 0


# --- seats ---


@pytest.fixture
def seat(db) -> Seat:
    seat = Seat(label="DKB-03", zone=Client.DKB, pos_x=2, pos_y=0)
    db.add(seat)
    db.flush()
    return seat


def book(db, user, seat, day, booked_at=NOW - timedelta(days=2)) -> SeatReservation:
    reservation = SeatReservation(seat_id=seat.id, user_id=user.id, date=day, created_at=booked_at)
    db.add(reservation)
    db.flush()
    return reservation


def test_tomorrows_seat_is_reminded_once(db, joao, seat):
    book(db, joao, seat, THURSDAY)

    assert (reminders.send_due(db).seats, reminders.send_due(db).seats) == (1, 0)
    assert reminders_of(db, joao) == [
        (NotificationType.SEAT_REMINDER, "Reminder: your seat DKB-03 is booked for Thu 15 Oct")
    ]


def test_on_friday_mondays_seat_is_reminded(db, joao, make_user, seat, frozen_clock):
    book(db, joao, seat, NEXT_MONDAY)
    book(db, make_user(), seat, FRIDAY)  # a different day: not due on Friday itself
    frozen_clock.move_to(datetime(2026, 10, 16, 10, 0, tzinfo=LISBON))

    assert reminders.send_due(db).seats == 1
    assert [t for t, _ in reminders_of(db, joao)] == [NotificationType.SEAT_REMINDER]


def test_a_seat_booked_today_for_tomorrow_needs_no_reminder(db, joao, seat):
    book(db, joao, seat, THURSDAY, booked_at=NOW - timedelta(hours=1))

    assert reminders.send_due(db).seats == 0


# --- the admin endpoint ---


def test_admins_can_send_due_reminders_now(client, db, admin, joao, seat, make_training):
    enroll(db, joao, make_training(timedelta(hours=5)))
    book(db, joao, seat, THURSDAY)

    response = client.post("/api/admin/reminders/run", headers=auth_headers(admin))

    assert response.status_code == 200
    assert response.json() == {"trainings": 1, "seats": 1}


def test_only_admins_can_send_reminders(client, joao):
    assert client.post("/api/admin/reminders/run", headers=auth_headers(joao)).status_code == 403
