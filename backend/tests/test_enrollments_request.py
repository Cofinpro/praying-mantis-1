"""BE-3.1: requesting a seat. Written before the code (TDD)."""

from datetime import UTC, datetime, timedelta

import pytest

from app.models import Enrollment, EnrollmentStatus, Level, Training
from tests.conftest import auth_headers

NOW = datetime.now(UTC).replace(microsecond=0)


@pytest.fixture
def admin(make_user):
    return make_user(name="Alex Admin", is_admin=True, level=Level.SENIOR_ARCHITECT)


@pytest.fixture
def junior(make_user):
    return make_user(name="João Silva", level=Level.JUNIOR)


@pytest.fixture
def make_training(db, admin):
    def _make_training(days: float = 7, levels=(Level.JUNIOR,), max_seats: int = 10, **fields) -> Training:
        starts_at = NOW + timedelta(days=days)
        training = Training(
            name=fields.pop("name", "Intro to FastAPI"),
            description="About FastAPI",
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=2),
            max_seats=max_seats,
            created_by=admin,
            levels=list(levels),
            **fields,
        )
        db.add(training)
        db.flush()
        return training

    return _make_training


@pytest.fixture
def enroll(db):
    """Puts a user straight into a status, bypassing the API (for setting up scenarios)."""

    def _enroll(user, training, status=EnrollmentStatus.APPROVED) -> Enrollment:
        enrollment = Enrollment(user_id=user.id, training_id=training.id, status=status)
        db.add(enrollment)
        db.flush()
        return enrollment

    return _enroll


def request_seat(client, user, training_id):
    return client.post(f"/api/trainings/{training_id}/enrollments", headers=auth_headers(user))


def error_code(response) -> str:
    return response.json()["detail"]["code"]


# --- the happy path ---


def test_request_creates_a_pending_enrollment(client, db, junior, make_training):
    training = make_training()

    response = request_seat(client, junior, training.id)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["training_id"] == training.id
    assert body["user_id"] == junior.id
    assert body["decision_comment"] is None
    assert body["decided_at"] is None
    assert body["requested_at"].endswith("Z")
    assert db.get(Enrollment, body["id"]).status == EnrollmentStatus.PENDING


# --- one test per rule ---


def test_wrong_level_is_403(client, junior, make_training):
    training = make_training(levels=[Level.SENIOR])

    response = request_seat(client, junior, training.id)

    assert response.status_code == 403


def test_past_training_is_409(client, junior, make_training):
    training = make_training(days=-1)

    response = request_seat(client, junior, training.id)

    assert response.status_code == 409
    assert error_code(response) == "training_started"


def test_cancelled_training_is_409(client, junior, make_training):
    training = make_training(cancelled_at=NOW)

    response = request_seat(client, junior, training.id)

    assert response.status_code == 409
    assert error_code(response) == "training_cancelled"


def test_full_training_is_409(client, junior, make_user, make_training, enroll):
    training = make_training(max_seats=2)
    enroll(make_user(), training)
    enroll(make_user(), training)

    response = request_seat(client, junior, training.id)

    assert response.status_code == 409
    assert error_code(response) == "training_full"


@pytest.mark.parametrize("status", [EnrollmentStatus.PENDING, EnrollmentStatus.APPROVED])
def test_already_requested_is_409(client, junior, make_training, enroll, status):
    training = make_training()
    enroll(junior, training, status)

    response = request_seat(client, junior, training.id)

    assert response.status_code == 409
    assert error_code(response) == "already_requested"


# --- the rest of the agreed rules ---


def test_pending_requests_dont_take_a_seat(client, junior, make_user, make_training, enroll):
    # Q7: only approved enrollments count
    training = make_training(max_seats=1)
    enroll(make_user(), training, EnrollmentStatus.PENDING)

    assert request_seat(client, junior, training.id).status_code == 201


def test_rejected_users_cant_request_again(client, junior, make_training, enroll):
    # Q8
    training = make_training()
    enroll(junior, training, EnrollmentStatus.REJECTED)

    response = request_seat(client, junior, training.id)

    assert response.status_code == 409
    assert error_code(response) == "request_rejected"


def test_withdrawn_users_can_request_again(client, db, junior, make_training, enroll):
    training = make_training()
    old = enroll(junior, training, EnrollmentStatus.WITHDRAWN)

    response = request_seat(client, junior, training.id)

    assert response.status_code == 201
    assert response.json()["id"] == old.id  # same row, back to pending
    assert response.json()["status"] == "pending"


def test_unknown_training_is_404(client, junior):
    assert request_seat(client, junior, 999_999).status_code == 404


def test_without_a_token_is_401(client, make_training):
    assert client.post(f"/api/trainings/{make_training().id}/enrollments").status_code == 401


def test_admins_follow_the_same_rules(client, admin, make_training):
    # Admins see every training, but they only join trainings for their own level
    assert request_seat(client, admin, make_training(levels=[Level.JUNIOR]).id).status_code == 403


# --- seats_left and my_enrollment_status (BE-2.2 placeholders) now use real data ---


def test_seats_left_counts_only_approved(client, junior, make_user, make_training, enroll):
    training = make_training(max_seats=5)
    enroll(make_user(), training, EnrollmentStatus.APPROVED)
    enroll(make_user(), training, EnrollmentStatus.APPROVED)
    enroll(make_user(), training, EnrollmentStatus.PENDING)
    enroll(make_user(), training, EnrollmentStatus.REJECTED)
    enroll(make_user(), training, EnrollmentStatus.WITHDRAWN)

    body = client.get(f"/api/trainings/{training.id}", headers=auth_headers(junior)).json()

    assert body["seats_left"] == 3


def test_my_enrollment_status_is_the_viewers_own(client, junior, make_user, make_training, enroll):
    mine = make_training(name="Mine")
    theirs = make_training(name="Theirs", days=8)
    enroll(junior, mine, EnrollmentStatus.PENDING)
    enroll(make_user(), theirs, EnrollmentStatus.APPROVED)

    listing = client.get("/api/trainings", headers=auth_headers(junior)).json()

    assert {t["name"]: t["my_enrollment_status"] for t in listing} == {"Mine": "pending", "Theirs": None}


def test_request_is_reflected_in_the_training_detail(client, junior, make_training):
    training = make_training()
    request_seat(client, junior, training.id)

    body = client.get(f"/api/trainings/{training.id}", headers=auth_headers(junior)).json()

    assert body["my_enrollment_status"] == "pending"
