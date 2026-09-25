from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import Enrollment, EnrollmentStatus, Level, Notification, NotificationType, Training
from app.services import notifications as notification_service
from tests.conftest import auth_headers

NOW = datetime.now(UTC).replace(microsecond=0)
T = NotificationType


@pytest.fixture
def admin(make_user):
    return make_user(name="Alex Admin", is_admin=True, level=Level.SENIOR_ARCHITECT)


@pytest.fixture
def lead(make_user):
    return make_user(name="Sofia Martins", level=Level.ARCHITECT)


@pytest.fixture
def employee(make_user, lead):
    return make_user(name="João Silva", team_lead=lead)


@pytest.fixture
def training(db, admin):
    starts_at = (NOW + timedelta(days=7)).replace(hour=9, minute=0, second=0)
    training = Training(
        name="Intro to FastAPI",
        description="About it",
        starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=2),
        max_seats=5,
        created_by=admin,
        levels=[Level.JUNIOR],
    )
    db.add(training)
    db.flush()
    return training


@pytest.fixture
def enroll(db):
    def _enroll(user, training, status=EnrollmentStatus.PENDING) -> Enrollment:
        enrollment = Enrollment(user_id=user.id, training_id=training.id, status=status)
        db.add(enrollment)
        db.flush()
        return enrollment

    return _enroll


def inbox(db, user) -> list[tuple[str, str, str | None]]:
    """(type, message, link) of a user's notifications, oldest first."""
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.id))
    return [(n.type.value, n.message, n.link) for n in rows]


def post(client, user, url, json=None):
    return client.post(url, json=json, headers=auth_headers(user))


# --- each event notifies the right people ---


def test_a_request_notifies_the_team_lead(client, db, lead, employee, training):
    post(client, employee, f"/api/trainings/{training.id}/enrollments")

    assert inbox(db, lead) == [
        ("enrollment_requested", "João Silva requested a seat in Intro to FastAPI", "/approvals")
    ]
    assert inbox(db, employee) == []


def test_a_request_without_a_team_lead_notifies_every_admin(client, db, admin, make_user, training):
    second_admin = make_user(is_admin=True)
    loner = make_user(name="Rafael Nunes")

    post(client, loner, f"/api/trainings/{training.id}/enrollments")

    assert [n[0] for n in inbox(db, admin)] == ["enrollment_requested"]
    assert [n[0] for n in inbox(db, second_admin)] == ["enrollment_requested"]


def test_an_admin_asking_for_themselves_doesnt_notify_themselves(client, db, admin, training):
    training.levels = [Level.SENIOR_ARCHITECT]
    db.flush()

    post(client, admin, f"/api/trainings/{training.id}/enrollments")

    assert inbox(db, admin) == []


def test_approval_notifies_the_requester(client, db, lead, employee, training, enroll):
    enrollment = enroll(employee, training)

    post(client, lead, f"/api/enrollments/{enrollment.id}/approve")

    assert inbox(db, employee) == [
        (
            "enrollment_approved",
            "You're in: Sofia Martins approved your seat in Intro to FastAPI",
            f"/trainings/{training.id}",
        )
    ]


def test_rejection_notifies_the_requester_with_the_comment(client, db, lead, employee, training, enroll):
    enrollment = enroll(employee, training)

    post(client, lead, f"/api/enrollments/{enrollment.id}/reject", {"comment": "Next time"})

    [(type_, message, _)] = inbox(db, employee)
    assert type_ == "enrollment_rejected"
    assert message == "Sofia Martins rejected your request for Intro to FastAPI: Next time"


def test_withdrawing_an_approved_seat_notifies_the_lead(client, db, lead, employee, training, enroll):
    enrollment = enroll(employee, training, EnrollmentStatus.APPROVED)

    post(client, employee, f"/api/enrollments/{enrollment.id}/withdraw")

    assert [n[0] for n in inbox(db, lead)] == ["enrollment_withdrawn"]


def test_withdrawing_a_pending_request_notifies_nobody(client, db, lead, employee, training, enroll):
    enrollment = enroll(employee, training, EnrollmentStatus.PENDING)

    post(client, employee, f"/api/enrollments/{enrollment.id}/withdraw")

    assert inbox(db, lead) == []


def test_cancelling_notifies_pending_and_approved_only(client, db, admin, make_user, training, enroll):
    pending, approved, rejected, withdrawn = (make_user() for _ in range(4))
    enroll(pending, training, EnrollmentStatus.PENDING)
    enroll(approved, training, EnrollmentStatus.APPROVED)
    enroll(rejected, training, EnrollmentStatus.REJECTED)
    enroll(withdrawn, training, EnrollmentStatus.WITHDRAWN)

    post(client, admin, f"/api/trainings/{training.id}/cancel")

    assert [n[0] for n in inbox(db, pending)] == ["training_cancelled"]
    assert [n[0] for n in inbox(db, approved)] == ["training_cancelled"]
    assert inbox(db, rejected) == inbox(db, withdrawn) == []
    assert "was cancelled" in inbox(db, approved)[0][1]


def test_a_change_notifies_enrolled_people_and_lists_what_changed(client, db, admin, employee, training, enroll):
    enroll(employee, training, EnrollmentStatus.APPROVED)
    later = training.starts_at + timedelta(hours=1)

    client.patch(
        f"/api/trainings/{training.id}",
        json={"starts_at": later.strftime("%Y-%m-%dT%H:%M:%SZ"), "ends_at": (later + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")},
        headers=auth_headers(admin),
    )

    assert inbox(db, employee) == [
        ("training_changed", "Intro to FastAPI was updated (start time, end time)", f"/trainings/{training.id}")
    ]


def test_a_patch_that_changes_nothing_notifies_nobody(client, db, admin, employee, training, enroll):
    enroll(employee, training, EnrollmentStatus.APPROVED)

    client.patch(f"/api/trainings/{training.id}", json={"name": "Intro to FastAPI", "levels": ["junior"]}, headers=auth_headers(admin))

    assert inbox(db, employee) == []


def test_a_failed_action_creates_no_notification(client, db, lead, employee, make_user, training, enroll):
    training.max_seats = 1
    enroll(make_user(), training, EnrollmentStatus.APPROVED)
    enrollment = enroll(employee, training)

    assert post(client, lead, f"/api/enrollments/{enrollment.id}/approve").status_code == 409

    assert inbox(db, employee) == []


def test_action_and_notification_are_one_transaction(client, db, lead, employee, training, enroll, monkeypatch):
    # If writing the notification fails, the approval must not be saved either
    def broken_notify(*args, **kwargs):
        raise RuntimeError("notification store is down")

    monkeypatch.setattr(notification_service, "notify", broken_notify)
    enrollment = enroll(employee, training)
    db.commit()  # the setup is "before" the request (still undone after the test)

    with pytest.raises(RuntimeError):
        post(client, lead, f"/api/enrollments/{enrollment.id}/approve")

    db.rollback()
    assert db.get(Enrollment, enrollment.id).status == EnrollmentStatus.PENDING


# --- the endpoints (the bell) ---


@pytest.fixture
def three_notifications(db, employee):
    for i, minutes in enumerate([30, 20, 10]):
        db.add(Notification(user_id=employee.id, type=T.ENROLLMENT_APPROVED, message=f"n{i}",
                            link=f"/trainings/{i}", created_at=NOW - timedelta(minutes=minutes)))
    db.add(Notification(user_id=employee.id, type=T.ENROLLMENT_REJECTED, message="old, read",
                        created_at=NOW - timedelta(days=1), read_at=NOW))
    db.flush()


def test_list_is_newest_first_with_the_unread_count(client, employee, three_notifications):
    body = client.get("/api/notifications", headers=auth_headers(employee)).json()

    assert body["unread_count"] == 3
    assert [n["message"] for n in body["items"]] == ["n2", "n1", "n0", "old, read"]
    assert set(body["items"][0]) == {"id", "type", "message", "link", "read", "created_at"}
    assert (body["items"][0]["read"], body["items"][3]["read"]) == (False, True)
    assert body["items"][0]["created_at"].endswith("Z")


def test_limit_trims_the_list_but_not_the_unread_count(client, employee, three_notifications):
    body = client.get("/api/notifications", params={"limit": 2}, headers=auth_headers(employee)).json()

    assert (len(body["items"]), body["unread_count"]) == (2, 3)


def test_mark_one_read(client, employee, three_notifications):
    newest = client.get("/api/notifications", headers=auth_headers(employee)).json()["items"][0]

    response = post(client, employee, f"/api/notifications/{newest['id']}/read")
    again = post(client, employee, f"/api/notifications/{newest['id']}/read")  # idempotent

    assert (response.status_code, again.status_code) == (204, 204)
    body = client.get("/api/notifications", headers=auth_headers(employee)).json()
    assert body["unread_count"] == 2
    assert body["items"][0]["read"] is True


def test_mark_all_read(client, employee, three_notifications):
    assert post(client, employee, "/api/notifications/read-all").status_code == 204

    assert client.get("/api/notifications", headers=auth_headers(employee)).json()["unread_count"] == 0


def test_only_my_own_notifications(client, make_user, employee, three_notifications):
    stranger = make_user()
    someone_elses = client.get("/api/notifications", headers=auth_headers(employee)).json()["items"][0]["id"]

    assert client.get("/api/notifications", headers=auth_headers(stranger)).json() == {"unread_count": 0, "items": []}
    assert post(client, stranger, f"/api/notifications/{someone_elses}/read").status_code == 404
    post(client, stranger, "/api/notifications/read-all")
    assert client.get("/api/notifications", headers=auth_headers(employee)).json()["unread_count"] == 3


def test_notifications_need_a_token(client):
    assert client.get("/api/notifications").status_code == 401
    assert client.post("/api/notifications/read-all").status_code == 401


@pytest.mark.parametrize("limit", [0, 101])
def test_invalid_limit_is_422(client, employee, limit):
    assert client.get("/api/notifications", params={"limit": limit}, headers=auth_headers(employee)).status_code == 422
