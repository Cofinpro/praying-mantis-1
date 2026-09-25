from datetime import UTC, datetime, timedelta
from itertools import product

import pytest

from app.errors import Conflict
from app.models import Enrollment, EnrollmentStatus, Level, Training
from app.services.enrollments import check_move
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
def owner(make_user, lead):
    return make_user(name="João Silva", team_lead=lead)


@pytest.fixture
def training(db, admin):
    starts_at = NOW + timedelta(days=7)
    training = Training(
        name="Intro to FastAPI",
        description="About it",
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=2),
        max_seats=3,
        created_by=admin,
        levels=[Level.JUNIOR],
    )
    db.add(training)
    db.flush()
    return training


@pytest.fixture
def enroll(db):
    def _enroll(user, training, status=S.PENDING) -> Enrollment:
        enrollment = Enrollment(user_id=user.id, training_id=training.id, status=status)
        db.add(enrollment)
        db.flush()
        return enrollment

    return _enroll


def withdraw(client, user, enrollment_id):
    return client.post(f"/api/enrollments/{enrollment_id}/withdraw", headers=auth_headers(user))


# --- the state machine, checked against the agreed diagram ---

ALLOWED = {
    (S.PENDING, S.APPROVED),
    (S.PENDING, S.REJECTED),
    (S.PENDING, S.WITHDRAWN),
    (S.APPROVED, S.WITHDRAWN),
    (S.WAITLISTED, S.PENDING),
    (S.WAITLISTED, S.WITHDRAWN),
}


@pytest.mark.parametrize(("current", "target"), sorted(product(S, S)))
def test_every_status_move_matches_the_diagram(current, target):
    if (current, target) in ALLOWED:
        check_move(current, target)  # doesn't raise
    else:
        with pytest.raises(Conflict):
            check_move(current, target)


# --- POST /api/enrollments/{id}/withdraw ---


@pytest.mark.parametrize("status", [S.PENDING, S.APPROVED])
def test_owner_withdraws_a_pending_or_approved_enrollment(client, db, owner, training, enroll, status):
    enrollment = enroll(owner, training, status)

    response = withdraw(client, owner, enrollment.id)

    assert response.status_code == 200
    assert response.json()["status"] == "withdrawn"
    db.expire_all()
    assert db.get(Enrollment, enrollment.id).status == S.WITHDRAWN


def test_withdrawing_an_approved_enrollment_frees_its_seat(client, owner, training, enroll):
    enrollment = enroll(owner, training, S.APPROVED)
    seats = lambda: client.get(f"/api/trainings/{training.id}", headers=auth_headers(owner)).json()["seats_left"]  # noqa: E731
    assert seats() == 2

    withdraw(client, owner, enrollment.id)

    assert seats() == 3


def test_my_status_shows_withdrawn(client, owner, training, enroll):
    withdraw(client, owner, enroll(owner, training).id)

    body = client.get(f"/api/trainings/{training.id}", headers=auth_headers(owner)).json()

    assert body["my_enrollment_status"] == "withdrawn"


@pytest.mark.parametrize("who", ["lead", "admin", "stranger"])
def test_only_the_owner_can_withdraw(client, make_user, lead, admin, owner, training, enroll, who):
    other = {"lead": lead, "admin": admin, "stranger": make_user()}[who]
    enrollment = enroll(owner, training)

    response = withdraw(client, other, enrollment.id)

    assert response.status_code == 403
    assert response.json() == {"detail": "You can only withdraw your own requests"}


@pytest.mark.parametrize("status", [S.REJECTED, S.WITHDRAWN])
def test_rejected_or_withdrawn_cant_be_withdrawn(client, owner, training, enroll, status):
    response = withdraw(client, owner, enroll(owner, training, status).id)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "not_withdrawable"


def test_cant_withdraw_once_the_training_started(client, db, owner, training, enroll):
    enrollment = enroll(owner, training, S.APPROVED)
    training.starts_at = NOW - timedelta(minutes=30)
    training.ends_at = NOW + timedelta(hours=1)
    db.flush()

    response = withdraw(client, owner, enrollment.id)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "training_started"


def test_withdraw_keeps_the_approval_record(client, db, lead, owner, training, enroll):
    enrollment = enroll(owner, training)
    client.post(f"/api/enrollments/{enrollment.id}/approve", headers=auth_headers(lead))

    withdraw(client, owner, enrollment.id)

    db.expire_all()
    stored = db.get(Enrollment, enrollment.id)
    assert (stored.status, stored.decided_by_id) == (S.WITHDRAWN, lead.id)


def test_a_withdrawn_request_disappears_from_the_leads_queue(client, lead, owner, training, enroll):
    enrollment = enroll(owner, training)
    assert len(client.get("/api/approvals", headers=auth_headers(lead)).json()) == 1

    withdraw(client, owner, enrollment.id)

    assert client.get("/api/approvals", headers=auth_headers(lead)).json() == []


def test_withdraw_then_request_again(client, owner, training, enroll):
    enrollment = enroll(owner, training)
    withdraw(client, owner, enrollment.id)

    response = client.post(f"/api/trainings/{training.id}/enrollments", headers=auth_headers(owner))

    assert (response.status_code, response.json()["status"]) == (201, "pending")


def test_withdraw_unknown_enrollment_is_404(client, owner):
    assert withdraw(client, owner, 999_999).status_code == 404


def test_withdraw_without_a_token_is_401(client, owner, training, enroll):
    assert client.post(f"/api/enrollments/{enroll(owner, training).id}/withdraw").status_code == 401
