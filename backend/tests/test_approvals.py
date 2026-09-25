from datetime import UTC, datetime, timedelta

import pytest

from app.models import Enrollment, EnrollmentStatus, Level, Training
from tests.conftest import auth_headers

NOW = datetime.now(UTC).replace(microsecond=0)


@pytest.fixture
def admin(make_user):
    return make_user(name="Alex Admin", is_admin=True, level=Level.SENIOR_ARCHITECT)


@pytest.fixture
def lead(make_user):
    return make_user(name="Sofia Martins", level=Level.ARCHITECT)


@pytest.fixture
def other_lead(make_user):
    return make_user(name="Tiago Costa", level=Level.ARCHITECT)


@pytest.fixture
def report(make_user, lead):
    return make_user(name="João Silva", team_lead=lead)


@pytest.fixture
def make_training(db, admin):
    def _make_training(name="Intro to FastAPI", days: float = 7, max_seats: int = 10, **fields) -> Training:
        starts_at = NOW + timedelta(days=days)
        training = Training(
            name=name,
            description="About it",
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=2),
            max_seats=max_seats,
            created_by=admin,
            levels=[Level.JUNIOR],
            **fields,
        )
        db.add(training)
        db.flush()
        return training

    return _make_training


@pytest.fixture
def enroll(db):
    def _enroll(user, training, status=EnrollmentStatus.PENDING, minutes_ago: int = 0) -> Enrollment:
        enrollment = Enrollment(
            user_id=user.id,
            training_id=training.id,
            status=status,
            requested_at=NOW - timedelta(minutes=minutes_ago),
        )
        db.add(enrollment)
        db.flush()
        return enrollment

    return _enroll


def approve(client, user, enrollment_id, **body):
    return client.post(f"/api/enrollments/{enrollment_id}/approve", json=body or None, headers=auth_headers(user))


def reject(client, user, enrollment_id, **body):
    return client.post(f"/api/enrollments/{enrollment_id}/reject", json=body or None, headers=auth_headers(user))


def approvals(client, user) -> list[dict]:
    return client.get("/api/approvals", headers=auth_headers(user)).json()


# --- GET /api/approvals ---


def test_lead_sees_only_their_reports_pending_requests(
    client, lead, report, other_lead, make_user, make_training, enroll
):
    training = make_training()
    mine = enroll(report, training, minutes_ago=5)
    enroll(make_user(team_lead=other_lead), training)  # someone else's report
    enroll(make_user(team_lead=lead), training, EnrollmentStatus.APPROVED)  # already decided

    body = approvals(client, lead)

    assert [a["enrollment"]["id"] for a in body] == [mine.id]
    assert body[0]["user"] == {"id": report.id, "name": "João Silva", "avatar_url": None}
    assert body[0]["training"]["name"] == "Intro to FastAPI"
    assert body[0]["training"]["seats_left"] == 9
    assert "description" not in body[0]["training"]  # a TrainingSummary


def test_admin_also_sees_users_without_a_team_lead(client, admin, report, make_user, make_training, enroll):
    training = make_training()
    no_lead = enroll(make_user(name="Rafael Nunes"), training)
    enroll(report, training)  # has a lead: not the admin's

    assert [a["enrollment"]["id"] for a in approvals(client, admin)] == [no_lead.id]


def test_nobody_sees_their_own_request(client, admin, make_training, enroll):
    enroll(admin, make_training())  # the admin has no team lead either

    assert approvals(client, admin) == []


def test_oldest_request_first(client, lead, make_user, make_training, enroll):
    training = make_training()
    newer = enroll(make_user(team_lead=lead), training, minutes_ago=1)
    older = enroll(make_user(team_lead=lead), training, minutes_ago=60)

    assert [a["enrollment"]["id"] for a in approvals(client, lead)] == [older.id, newer.id]


def test_past_and_cancelled_trainings_are_left_out(client, lead, make_user, make_training, enroll):
    enroll(make_user(team_lead=lead), make_training("Past", days=-1))
    enroll(make_user(team_lead=lead), make_training("Cancelled", cancelled_at=NOW))

    assert approvals(client, lead) == []


def test_employees_get_an_empty_list(client, report):
    assert approvals(client, report) == []


def test_approvals_without_a_token_is_401(client):
    assert client.get("/api/approvals").status_code == 401


# --- approve ---


def test_lead_approves_and_the_decision_is_stored(client, db, lead, report, make_training, enroll):
    enrollment = enroll(report, make_training())

    response = approve(client, lead, enrollment.id, comment="Enjoy!")

    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    assert response.json()["decision_comment"] == "Enjoy!"
    db.expire_all()
    stored = db.get(Enrollment, enrollment.id)
    assert stored.decided_by_id == lead.id
    assert stored.decided_at is not None
    assert stored.decision_comment == "Enjoy!"


def test_approve_without_a_body(client, lead, report, make_training, enroll):
    enrollment = enroll(report, make_training())

    assert approve(client, lead, enrollment.id).json()["decision_comment"] is None


def test_approving_someone_who_isnt_my_report_is_403(client, other_lead, report, make_training, enroll):
    enrollment = enroll(report, make_training())

    response = approve(client, other_lead, enrollment.id)

    assert response.status_code == 403
    assert response.json() == {"detail": "You can only decide requests from your own reports"}


def test_admin_cant_decide_for_someone_who_has_a_lead(client, admin, report, make_training, enroll):
    assert approve(client, admin, enroll(report, make_training()).id).status_code == 403


def test_admin_approves_users_without_a_team_lead(client, admin, make_user, make_training, enroll):
    enrollment = enroll(make_user(), make_training())

    assert approve(client, admin, enrollment.id).json()["status"] == "approved"


def test_approving_my_own_request_is_403(client, admin, make_training, enroll):
    assert approve(client, admin, enroll(admin, make_training()).id).status_code == 403


def test_approving_when_full_is_409(client, lead, report, make_user, make_training, enroll):
    training = make_training(max_seats=1)
    enroll(make_user(), training, EnrollmentStatus.APPROVED)
    enrollment = enroll(report, training)

    response = approve(client, lead, enrollment.id)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "training_full"


def test_approving_twice_is_409(client, lead, report, make_training, enroll):
    enrollment = enroll(report, make_training())
    approve(client, lead, enrollment.id)

    response = approve(client, lead, enrollment.id)

    assert response.status_code == 409
    assert response.json()["detail"] == {"code": "not_pending", "message": "This request is already approved"}


@pytest.mark.parametrize(
    ("fields", "code"),
    [({"days": -1}, "training_started"), ({"cancelled_at": NOW}, "training_cancelled")],
)
def test_approving_for_a_past_or_cancelled_training_is_409(client, lead, report, make_training, enroll, fields, code):
    enrollment = enroll(report, make_training(**fields))

    assert approve(client, lead, enrollment.id).json()["detail"]["code"] == code


def test_approve_unknown_enrollment_is_404(client, lead):
    assert approve(client, lead, 999_999).status_code == 404


def test_approve_without_a_token_is_401(client, report, make_training, enroll):
    assert client.post(f"/api/enrollments/{enroll(report, make_training()).id}/approve").status_code == 401


def test_approval_takes_a_seat(client, lead, report, make_training, enroll):
    training = make_training(max_seats=3)
    approve(client, lead, enroll(report, training).id)

    assert client.get(f"/api/trainings/{training.id}", headers=auth_headers(report)).json()["seats_left"] == 2


# --- reject ---


def test_reject_with_a_comment(client, db, lead, report, make_training, enroll):
    enrollment = enroll(report, make_training())

    response = reject(client, lead, enrollment.id, comment="Take the basics first")

    assert response.status_code == 200
    assert (response.json()["status"], response.json()["decision_comment"]) == ("rejected", "Take the basics first")
    db.expire_all()
    assert db.get(Enrollment, enrollment.id).decided_by_id == lead.id


def test_rejected_user_cant_request_again(client, lead, report, make_training, enroll):
    training = make_training()
    reject(client, lead, enroll(report, training).id)

    response = client.post(f"/api/trainings/{training.id}/enrollments", headers=auth_headers(report))

    assert response.json()["detail"]["code"] == "request_rejected"


def test_reject_works_even_when_full(client, lead, report, make_user, make_training, enroll):
    training = make_training(max_seats=1)
    enroll(make_user(), training, EnrollmentStatus.APPROVED)

    assert reject(client, lead, enroll(report, training).id).status_code == 200


def test_reject_follows_the_same_permissions(client, other_lead, report, make_training, enroll):
    assert reject(client, other_lead, enroll(report, make_training()).id).status_code == 403


def test_rejecting_a_decided_request_is_409(client, lead, report, make_training, enroll):
    enrollment = enroll(report, make_training(), EnrollmentStatus.APPROVED)

    assert reject(client, lead, enrollment.id).json()["detail"]["code"] == "not_pending"


def test_comment_is_limited_to_500_characters(client, lead, report, make_training, enroll):
    assert reject(client, lead, enroll(report, make_training()).id, comment="x" * 501).status_code == 422
