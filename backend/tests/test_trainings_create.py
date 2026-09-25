from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, OperationalError

from app.models import Level, Training, TrainingLevel
from tests.conftest import auth_headers

URL = "/api/trainings"


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


NEXT_WEEK = (datetime.now(UTC) + timedelta(days=7)).replace(hour=9, minute=0, second=0, microsecond=0)


def valid_body(**overrides) -> dict:
    body = {
        "name": "Intro to FastAPI",
        "description": "Routers, dependencies and Pydantic.",
        "starts_at": iso(NEXT_WEEK),
        "ends_at": iso(NEXT_WEEK + timedelta(hours=3)),
        "max_seats": 12,
        "trainer_id": None,
        "external_trainer_name": None,
        "levels": ["junior", "expert"],
    }
    return body | overrides


@pytest.fixture
def admin(make_user):
    return make_user(name="Alex Admin", is_admin=True)


@pytest.fixture
def trainer(make_user):
    return make_user(name="Ana Silva", level=Level.ARCHITECT)


def post(client, admin, body):
    return client.post(URL, json=body, headers=auth_headers(admin))


def error_locs(response) -> list[tuple]:
    """Where each 422 error points, e.g. [("body", "max_seats")]."""
    return [tuple(error["loc"]) for error in response.json()["detail"]]


# --- permissions ---


def test_without_a_token_is_401(client):
    assert client.post(URL, json=valid_body()).status_code == 401


def test_as_a_non_admin_is_403(client, make_user):
    employee = make_user()
    assert post(client, employee, valid_body()).status_code == 403


# --- success ---


def test_creates_a_training_and_returns_the_contract_shape(client, db, admin, trainer):
    response = post(client, admin, valid_body(trainer_id=trainer.id))

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "name": "Intro to FastAPI",
        "description": "Routers, dependencies and Pydantic.",
        "starts_at": iso(NEXT_WEEK),
        "ends_at": iso(NEXT_WEEK + timedelta(hours=3)),
        "levels": ["junior", "expert"],
        "trainer": {"id": trainer.id, "name": "Ana Silva"},
        "external_trainer_name": None,
        "max_seats": 12,
        "seats_left": 12,
        "cancelled": False,
        "my_enrollment_status": None,
    }
    training = db.get(Training, body["id"])
    assert training.created_by_id == admin.id
    assert sorted(training.levels) == [Level.EXPERT, Level.JUNIOR]


def test_external_trainer_with_and_without_a_name(client, admin):
    named = post(client, admin, valid_body(external_trainer_name="  Jane Doe  ")).json()
    unnamed = post(client, admin, valid_body()).json()

    assert (named["trainer"], named["external_trainer_name"]) == (None, "Jane Doe")
    assert (unnamed["trainer"], unnamed["external_trainer_name"]) == (None, None)


def test_times_with_an_offset_are_stored_and_returned_in_utc(client, db, admin):
    lisbon_summer = NEXT_WEEK.astimezone().replace(tzinfo=None)  # any local wall time
    body = valid_body(
        starts_at=f"{lisbon_summer:%Y-%m-%dT%H:%M:%S}+02:00",
        ends_at=f"{lisbon_summer + timedelta(hours=1):%Y-%m-%dT%H:%M:%S}+02:00",
    )

    created = post(client, admin, body).json()

    expected = lisbon_summer.replace(tzinfo=UTC) - timedelta(hours=2)
    assert created["starts_at"] == iso(expected)
    raw = db.execute(text("SELECT starts_at FROM trainings WHERE id = :id"), {"id": created["id"]}).scalar()
    assert raw == expected.replace(tzinfo=None)  # MySQL holds naive UTC


def test_levels_are_deduplicated_and_sorted_junior_first(client, admin):
    body = valid_body(levels=["senior_architect", "junior", "senior_architect", "senior"])

    assert post(client, admin, body).json()["levels"] == ["junior", "senior", "senior_architect"]


# --- one test per agreed validation rule ---


@pytest.mark.parametrize(
    "field", ["name", "description", "starts_at", "ends_at", "max_seats", "levels"]
)
def test_required_fields(client, admin, field):
    body = valid_body()
    del body[field]

    response = post(client, admin, body)

    assert response.status_code == 422
    assert ("body", field) in error_locs(response)


@pytest.mark.parametrize("field", ["name", "description"])
def test_blank_text_is_rejected(client, admin, field):
    response = post(client, admin, valid_body(**{field: "   "}))

    assert response.status_code == 422
    assert error_locs(response) == [("body", field)]


def test_end_must_be_after_start(client, admin):
    response = post(client, admin, valid_body(ends_at=iso(NEXT_WEEK)))  # same as starts_at

    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == "Value error, ends_at must be after starts_at"


def test_start_must_be_in_the_future(client, admin):
    yesterday = datetime.now(UTC) - timedelta(days=1)
    body = valid_body(starts_at=iso(yesterday), ends_at=iso(yesterday + timedelta(hours=1)))

    response = post(client, admin, body)

    assert response.status_code == 422
    assert error_locs(response) == [("body", "starts_at")]


@pytest.mark.parametrize("max_seats", [0, -1])
def test_max_seats_must_be_at_least_1(client, admin, max_seats):
    response = post(client, admin, valid_body(max_seats=max_seats))

    assert response.status_code == 422
    assert error_locs(response) == [("body", "max_seats")]


def test_at_least_one_level(client, admin):
    response = post(client, admin, valid_body(levels=[]))

    assert response.status_code == 422
    assert error_locs(response) == [("body", "levels")]


def test_unknown_level_is_rejected(client, admin):
    response = post(client, admin, valid_body(levels=["intern"]))

    assert response.status_code == 422
    assert error_locs(response) == [("body", "levels", 0)]


def test_trainer_and_external_name_together_are_rejected(client, admin, trainer):
    response = post(client, admin, valid_body(trainer_id=trainer.id, external_trainer_name="Jane"))

    assert response.status_code == 422
    assert "not both" in response.json()["detail"][0]["msg"]


def test_unknown_trainer_is_422_in_the_same_format(client, admin):
    response = post(client, admin, valid_body(trainer_id=999_999))

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "trainer_id"]
    assert error["type"] == "trainer_not_found"


def test_times_without_a_time_zone_are_rejected(client, admin):
    body = valid_body(starts_at=f"{NEXT_WEEK:%Y-%m-%dT%H:%M:%S}")  # no Z, no offset

    response = post(client, admin, body)

    assert response.status_code == 422
    assert error_locs(response) == [("body", "starts_at")]


# --- the database as the last line of defence ---


def make_training(db, admin, **overrides) -> Training:
    fields = {
        "name": "T",
        "description": "D",
        "starts_at": NEXT_WEEK,
        "ends_at": NEXT_WEEK + timedelta(hours=1),
        "max_seats": 5,
        "created_by": admin,
        "levels": [Level.JUNIOR],
    } | overrides
    training = Training(**fields)
    db.add(training)
    db.flush()
    return training


@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"max_seats": 0}, id="max_seats > 0"),
        pytest.param({"ends_at": NEXT_WEEK - timedelta(hours=1)}, id="ends_at > starts_at"),
    ],
)
def test_check_constraints_in_mysql(db, admin, overrides):
    with pytest.raises((IntegrityError, OperationalError)):
        make_training(db, admin, **overrides)
    db.rollback()


def test_deleting_a_training_deletes_its_levels(db, admin):
    training = make_training(db, admin, levels=[Level.JUNIOR, Level.SENIOR])

    db.execute(text("DELETE FROM trainings WHERE id = :id"), {"id": training.id})

    assert db.scalars(select(TrainingLevel).where(TrainingLevel.training_id == training.id)).all() == []
