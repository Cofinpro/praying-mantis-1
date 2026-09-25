"""GET /api/me/enrollments with a frozen clock, so "upcoming" vs "completed" is fixed."""

from datetime import UTC, datetime, timedelta

import pytest
import time_machine

from app.models import Enrollment, EnrollmentStatus, Level, Training
from tests.conftest import auth_headers

# "Now" for every test in this file: Wednesday 14 Oct 2026, 12:00 UTC
FROZEN_NOW = datetime(2026, 10, 14, 12, 0, tzinfo=UTC)
S = EnrollmentStatus


@pytest.fixture(autouse=True)
def frozen_clock():
    with time_machine.travel(FROZEN_NOW, tick=False) as traveller:
        yield traveller


@pytest.fixture
def me(make_user):
    return make_user(name="João Silva", level=Level.JUNIOR)


@pytest.fixture
def make_training(db, make_user):
    admin = make_user(is_admin=True)

    def _make_training(name: str, starts: datetime, hours: float = 2, **fields) -> Training:
        training = Training(
            name=name, description="x", starts_at=starts, ends_at=starts + timedelta(hours=hours),
            max_seats=10, created_by=admin, levels=[Level.JUNIOR], **fields,
        )
        db.add(training)
        db.flush()
        return training

    return _make_training


@pytest.fixture
def enroll(db):
    def _enroll(user, training, status) -> Enrollment:
        e = Enrollment(user_id=user.id, training_id=training.id, status=status, requested_at=FROZEN_NOW - timedelta(days=30))
        db.add(e)
        db.flush()
        return e

    return _enroll


def my_enrollments(client, user) -> dict[str, list[str]]:
    body = client.get("/api/me/enrollments", headers=auth_headers(user)).json()
    return {section: [t["name"] for t in trainings] for section, trainings in body.items()}


def at(day: int, hour: int = 9) -> datetime:
    return datetime(2026, 10, day, hour, 0, tzinfo=UTC)


def test_sections_follow_the_clock(client, me, make_training, enroll):
    enroll(me, make_training("Next week", at(21)), S.APPROVED)
    enroll(me, make_training("Tomorrow", at(15)), S.APPROVED)
    enroll(me, make_training("Right now", at(14, 11)), S.APPROVED)  # 11:00-13:00, it's 12:00
    enroll(me, make_training("Last week", at(7)), S.APPROVED)
    enroll(me, make_training("Earlier today", at(14, 8)), S.APPROVED)  # ended at 10:00
    enroll(me, make_training("Waiting", at(20)), S.PENDING)

    assert my_enrollments(client, me) == {
        "upcoming": ["Right now", "Tomorrow", "Next week"],  # soonest first
        "pending": ["Waiting"],
        "completed": ["Earlier today", "Last week"],  # most recent first
    }


def test_time_moves_a_training_from_upcoming_to_completed(client, me, make_training, enroll, frozen_clock):
    enroll(me, make_training("Tomorrow", at(15)), S.APPROVED)
    assert my_enrollments(client, me)["upcoming"] == ["Tomorrow"]

    frozen_clock.move_to(at(16))

    assert my_enrollments(client, me) == {"upcoming": [], "pending": [], "completed": ["Tomorrow"]}


def test_rejected_withdrawn_and_cancelled_are_left_out(client, me, make_training, enroll):
    enroll(me, make_training("Rejected", at(20)), S.REJECTED)
    enroll(me, make_training("Withdrawn", at(20)), S.WITHDRAWN)
    enroll(me, make_training("Cancelled", at(20), cancelled_at=FROZEN_NOW), S.APPROVED)
    enroll(me, make_training("Cancelled, past", at(1), cancelled_at=at(1, 0)), S.APPROVED)  # not "completed"

    assert my_enrollments(client, me) == {"upcoming": [], "pending": [], "completed": []}


def test_a_pending_request_for_a_past_training_is_left_out(client, me, make_training, enroll):
    # Nobody decided in time: it can't become anything any more
    enroll(me, make_training("Missed", at(10)), S.PENDING)

    assert my_enrollments(client, me)["pending"] == []


def test_only_my_own_enrollments(client, me, make_user, make_training, enroll):
    enroll(make_user(), make_training("Theirs", at(20)), S.APPROVED)

    assert my_enrollments(client, me) == {"upcoming": [], "pending": [], "completed": []}


def test_items_are_training_summaries_with_my_status(client, me, make_training, enroll):
    training = make_training("Tomorrow", at(15))
    enroll(me, training, S.APPROVED)

    [item] = client.get("/api/me/enrollments", headers=auth_headers(me)).json()["upcoming"]

    assert item["id"] == training.id
    assert item["my_enrollment_status"] == "approved"
    assert item["seats_left"] == 9
    assert item["starts_at"] == "2026-10-15T09:00:00Z"
    assert "description" not in item


def test_needs_a_token(client):
    assert client.get("/api/me/enrollments").status_code == 401
