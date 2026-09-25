from datetime import UTC, datetime, timedelta

import pytest

from app.models import Level, Training
from app.services import trainings as service
from tests.conftest import auth_headers

URL = "/api/trainings"
NEXT_WEEK = (datetime.now(UTC) + timedelta(days=7)).replace(hour=9, minute=0, second=0, microsecond=0)


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture
def admin(make_user):
    return make_user(name="Alex Admin", is_admin=True)


@pytest.fixture
def trainer(make_user):
    return make_user(name="Ana Silva", level=Level.ARCHITECT)


@pytest.fixture
def training(db, admin, trainer):
    training = Training(
        name="Intro to FastAPI",
        description="Routers and dependencies.",
        starts_at=NEXT_WEEK,
        ends_at=NEXT_WEEK + timedelta(hours=3),
        max_seats=12,
        trainer=trainer,
        created_by=admin,
        levels=[Level.JUNIOR, Level.EXPERT],
    )
    db.add(training)
    db.flush()
    return training


def patch(client, admin, training_id, body):
    return client.patch(f"{URL}/{training_id}", json=body, headers=auth_headers(admin))


def cancel(client, admin, training_id):
    return client.post(f"{URL}/{training_id}/cancel", headers=auth_headers(admin))


# --- PATCH: permissions and 404 ---


def test_patch_without_a_token_is_401(client, training):
    assert client.patch(f"{URL}/{training.id}", json={"name": "X"}).status_code == 401


def test_patch_as_a_non_admin_is_403(client, make_user, training):
    assert patch(client, make_user(), training.id, {"name": "X"}).status_code == 403


def test_patch_unknown_training_is_404(client, admin):
    assert patch(client, admin, 999_999, {"name": "X"}).status_code == 404


# --- PATCH changes only what was sent ---


def test_patch_changes_only_the_fields_that_were_sent(client, admin, training, trainer):
    response = patch(client, admin, training.id, {"name": "FastAPI deep dive", "max_seats": 8})

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "FastAPI deep dive"
    assert body["max_seats"] == 8
    # Everything else is untouched
    assert body["description"] == "Routers and dependencies."
    assert body["starts_at"] == iso(NEXT_WEEK)
    assert body["levels"] == ["junior", "expert"]
    assert body["trainer"] == {"id": trainer.id, "name": "Ana Silva"}


def test_empty_patch_changes_nothing(client, admin, training):
    before = client.get(f"{URL}/{training.id}", headers=auth_headers(admin)).json()

    response = patch(client, admin, training.id, {})

    assert response.status_code == 200
    assert response.json() == before


def test_patch_levels_replaces_the_list(client, db, admin, training):
    response = patch(client, admin, training.id, {"levels": ["senior", "junior", "senior"]})

    assert response.json()["levels"] == ["junior", "senior"]
    db.expire_all()
    assert sorted(db.get(Training, training.id).levels) == [Level.JUNIOR, Level.SENIOR]


def test_switching_to_an_external_trainer(client, admin, training):
    response = patch(client, admin, training.id, {"trainer_id": None, "external_trainer_name": "Jane Doe"})

    assert (response.json()["trainer"], response.json()["external_trainer_name"]) == (None, "Jane Doe")


# --- PATCH validation ---


@pytest.mark.parametrize("field", ["name", "description", "starts_at", "ends_at", "max_seats", "levels"])
def test_required_fields_cant_be_set_to_null(client, admin, training, field):
    response = patch(client, admin, training.id, {field: None})

    assert response.status_code == 422
    assert field in response.json()["detail"][0]["msg"]


def test_same_field_rules_as_create(client, admin, training):
    yesterday = datetime.now(UTC) - timedelta(days=1)
    for body in [{"name": "  "}, {"max_seats": 0}, {"levels": []}, {"starts_at": iso(yesterday)}]:
        assert patch(client, admin, training.id, body).status_code == 422, body


def test_end_before_the_existing_start_is_rejected(client, admin, training):
    # Only ends_at is sent: it's compared with the training's current starts_at
    response = patch(client, admin, training.id, {"ends_at": iso(NEXT_WEEK - timedelta(hours=1))})

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert (error["loc"], error["type"]) == (["body", "ends_at"], "ends_before_start")


def test_start_after_the_existing_end_is_rejected(client, admin, training):
    response = patch(client, admin, training.id, {"starts_at": iso(NEXT_WEEK + timedelta(days=1))})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "starts_at"]


def test_moving_both_times_together_is_fine(client, admin, training):
    later = NEXT_WEEK + timedelta(days=3)
    body = {"starts_at": iso(later), "ends_at": iso(later + timedelta(hours=2))}

    assert patch(client, admin, training.id, body).json()["starts_at"] == iso(later)


def test_external_name_while_the_training_has_a_trainer_is_rejected(client, admin, training):
    response = patch(client, admin, training.id, {"external_trainer_name": "Jane Doe"})

    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "trainer_and_external"


def test_unknown_trainer_is_422(client, admin, training):
    response = patch(client, admin, training.id, {"trainer_id": 999_999})

    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "trainer_not_found"


# --- max_seats vs approved enrollments (409) ---


def test_max_seats_below_the_approved_count_is_409(client, admin, training, monkeypatch):
    # Enrollments arrive in BE-3.1; pretend 5 people are already approved
    monkeypatch.setattr(service, "count_approved", lambda db, training_id: 5)

    response = patch(client, admin, training.id, {"max_seats": 4})

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "max_seats_below_approved"


def test_max_seats_equal_to_the_approved_count_is_fine(client, admin, training, monkeypatch):
    monkeypatch.setattr(service, "count_approved", lambda db, training_id: 5)

    assert patch(client, admin, training.id, {"max_seats": 5}).status_code == 200


# --- cancel (soft delete) ---


def test_cancel_sets_cancelled_and_keeps_the_training(client, db, admin, training):
    response = cancel(client, admin, training.id)

    assert response.status_code == 200
    assert response.json()["cancelled"] is True
    db.expire_all()
    stored = db.get(Training, training.id)
    assert stored is not None  # soft delete: the row is still there
    assert stored.cancelled_at is not None


def test_cancelled_trainings_cant_be_edited(client, admin, training):
    cancel(client, admin, training.id)

    response = patch(client, admin, training.id, {"name": "Too late"})

    assert response.status_code == 409
    assert response.json() == {
        "detail": {"code": "training_cancelled", "message": "This training is cancelled and can't be changed"}
    }


def test_cancelling_twice_is_409(client, admin, training):
    cancel(client, admin, training.id)

    response = cancel(client, admin, training.id)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "training_cancelled"


def test_a_started_training_cant_be_cancelled(client, db, admin, training):
    training.starts_at = datetime.now(UTC) - timedelta(hours=1)
    training.ends_at = datetime.now(UTC) + timedelta(hours=1)
    db.flush()

    response = cancel(client, admin, training.id)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "training_started"


def test_cancel_permissions_and_404(client, make_user, admin, training):
    assert client.post(f"{URL}/{training.id}/cancel").status_code == 401
    assert cancel(client, make_user(), training.id).status_code == 403
    assert cancel(client, admin, 999_999).status_code == 404


def test_cancelled_training_disappears_from_the_employee_list(client, make_user, admin, training):
    junior = make_user(level=Level.JUNIOR)
    assert [t["id"] for t in client.get(URL, headers=auth_headers(junior)).json()] == [training.id]

    cancel(client, admin, training.id)

    assert client.get(URL, headers=auth_headers(junior)).json() == []
