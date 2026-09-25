"""The waitlist of a full training: joining, positions, and moving up when a place opens."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import Enrollment, EnrollmentStatus, Level, Notification, NotificationType, Training
from tests.conftest import auth_headers

NOW = datetime.now(UTC).replace(microsecond=0)
S = EnrollmentStatus


@pytest.fixture
def admin(make_user):
    return make_user(name="Alex Admin", is_admin=True, level=Level.SENIOR_ARCHITECT)


@pytest.fixture
def lead(make_user):
    return make_user(name="Sofia Martins", level=Level.ARCHITECT)


@pytest.fixture
def people(make_user, lead):
    """Five juniors reporting to Sofia."""
    return [make_user(name=f"Junior {n}", team_lead=lead) for n in range(1, 6)]


@pytest.fixture
def training(db, admin):
    """Two seats."""
    starts_at = NOW + timedelta(days=7)
    training = Training(
        name="Git basics",
        description="About it",
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=2),
        max_seats=2,
        created_by=admin,
        levels=[Level.JUNIOR],
    )
    db.add(training)
    db.flush()
    return training


@pytest.fixture
def enroll(db, training):
    """Adds enrollments in order, one second apart, so "first come" is well defined."""
    count = 0

    def _enroll(user, status) -> Enrollment:
        nonlocal count
        count += 1
        enrollment = Enrollment(
            user_id=user.id,
            training_id=training.id,
            status=status,
            requested_at=NOW - timedelta(hours=1) + timedelta(seconds=count),
        )
        db.add(enrollment)
        db.flush()
        return enrollment

    return _enroll


def join(client, user, training):
    return client.post(f"/api/trainings/{training.id}/waitlist", headers=auth_headers(user))


def withdraw(client, user, enrollment):
    return client.post(f"/api/enrollments/{enrollment.id}/withdraw", headers=auth_headers(user))


def position(client, user, training):
    body = client.get(f"/api/trainings/{training.id}", headers=auth_headers(user)).json()
    return body["my_enrollment_status"], body["my_waitlist_position"]


def notifications_of(db, user) -> list[tuple[NotificationType, str]]:
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.id))
    return [(n.type, n.message) for n in rows]


def status_of(db, enrollment) -> EnrollmentStatus:
    db.refresh(enrollment)
    return enrollment.status


@pytest.fixture
def full(enroll, people):
    """Junior 1 and 2 have both seats."""
    return [enroll(people[0], S.APPROVED), enroll(people[1], S.APPROVED)]


# --- joining ---


def test_joining_the_waitlist_of_a_full_training(client, db, training, people, full, lead):
    response = join(client, people[2], training)

    assert response.status_code == 201
    assert response.json()["status"] == "waitlisted"
    assert position(client, people[2], training) == ("waitlisted", 1)
    assert notifications_of(db, lead) == []  # nothing to decide yet


def test_a_training_with_seats_left_has_no_waitlist(client, training, people):
    response = join(client, people[0], training)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "training_not_full"


def test_requesting_a_seat_in_a_full_training_still_says_full(client, training, people, full):
    response = client.post(f"/api/trainings/{training.id}/enrollments", headers=auth_headers(people[2]))

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "training_full"


def test_joining_twice_or_requesting_while_waitlisted_is_refused(client, training, people, full):
    join(client, people[2], training)

    again = join(client, people[2], training)
    request = client.post(f"/api/trainings/{training.id}/enrollments", headers=auth_headers(people[2]))

    assert again.json()["detail"]["code"] == "already_waitlisted"
    assert request.json()["detail"]["code"] == "already_waitlisted"


def test_positions_are_first_come_first_served(client, training, people, full):
    join(client, people[2], training)
    join(client, people[3], training)

    assert position(client, people[2], training) == ("waitlisted", 1)
    assert position(client, people[3], training) == ("waitlisted", 2)
    assert position(client, people[0], training) == ("approved", None)


# --- moving up ---


def test_a_withdrawn_seat_moves_the_first_in_line_to_pending(client, db, training, people, full, enroll, lead):
    first, second = enroll(people[2], S.WAITLISTED), enroll(people[3], S.WAITLISTED)

    assert withdraw(client, people[0], full[0]).status_code == 200

    assert status_of(db, first) == S.PENDING
    assert status_of(db, second) == S.WAITLISTED
    assert position(client, people[3], training) == ("waitlisted", 1)
    assert (NotificationType.WAITLIST_PROMOTED,
            "A place opened up in Git basics: your request now waits for approval") in notifications_of(db, people[2])
    assert (NotificationType.ENROLLMENT_REQUESTED,
            "Junior 3 moved up from the waitlist for Git basics") in notifications_of(db, lead)


def test_the_promoted_request_shows_up_for_approval(client, db, training, people, full, enroll, lead):
    first = enroll(people[2], S.WAITLISTED)
    withdraw(client, people[0], full[0])

    approvals = client.get("/api/approvals", headers=auth_headers(lead)).json()
    approved = client.post(f"/api/enrollments/{first.id}/approve", headers=auth_headers(lead))

    assert [a["enrollment"]["id"] for a in approvals] == [first.id]
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"


def test_leaving_the_waitlist_moves_the_others_up(client, db, training, people, full, enroll):
    first, _second = enroll(people[2], S.WAITLISTED), enroll(people[3], S.WAITLISTED)

    response = withdraw(client, people[2], first)

    assert response.status_code == 200
    assert response.json()["status"] == "withdrawn"
    assert position(client, people[3], training) == ("waitlisted", 1)


def test_a_waiting_request_is_never_overtaken(client, db, training, people, enroll, lead):
    # Junior 1 is approved and Junior 2 still pending: both places are taken, even though one isn't a seat yet
    approved, pending = enroll(people[0], S.APPROVED), enroll(people[1], S.PENDING)
    enroll(people[2], S.APPROVED)  # the training was full when...
    waiting = enroll(people[3], S.WAITLISTED)  # ...Junior 4 joined the waitlist

    withdraw(client, people[2], db.scalar(select(Enrollment).where(Enrollment.user_id == people[2].id)))
    assert status_of(db, waiting) == S.WAITLISTED  # 1 approved + 1 pending = 2 places, none free

    client.post(f"/api/enrollments/{pending.id}/reject", headers=auth_headers(lead))
    assert status_of(db, waiting) == S.PENDING  # the rejection freed that place
    assert status_of(db, approved) == S.APPROVED


def test_more_seats_promote_as_many_as_the_new_places(client, db, admin, training, people, full, enroll):
    waiting = [enroll(people[2], S.WAITLISTED), enroll(people[3], S.WAITLISTED), enroll(people[4], S.WAITLISTED)]

    response = client.patch(f"/api/trainings/{training.id}", headers=auth_headers(admin), json={"max_seats": 4})

    assert response.status_code == 200
    assert [status_of(db, e) for e in waiting] == [S.PENDING, S.PENDING, S.WAITLISTED]


def test_nobody_moves_up_in_a_cancelled_training(client, db, admin, training, people, full, enroll):
    waiting = enroll(people[2], S.WAITLISTED)
    client.post(f"/api/trainings/{training.id}/cancel", headers=auth_headers(admin))

    withdraw(client, people[0], full[0])

    assert status_of(db, waiting) == S.WAITLISTED
    assert NotificationType.TRAINING_CANCELLED in [t for t, _ in notifications_of(db, people[2])]


# --- the Profile page ---


def test_waitlisted_trainings_are_with_the_pending_ones(client, training, people, full, enroll):
    enroll(people[2], S.WAITLISTED)

    body = client.get("/api/me/enrollments", headers=auth_headers(people[2])).json()

    assert [(t["id"], t["my_enrollment_status"], t["my_waitlist_position"]) for t in body["pending"]] == [
        (training.id, "waitlisted", 1)
    ]
    assert body["upcoming"] == []
