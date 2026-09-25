from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import event

from app.models import Level, Training
from tests.conftest import auth_headers

URL = "/api/trainings"
NOW = datetime.now(UTC).replace(microsecond=0)


@pytest.fixture
def admin(make_user):
    return make_user(name="Alex Admin", is_admin=True)


@pytest.fixture
def junior(make_user):
    return make_user(name="João Silva", level=Level.JUNIOR)


@pytest.fixture
def make_training(db, admin):
    def _make_training(name: str, days: float, levels: list[Level], **fields) -> Training:
        starts_at = NOW + timedelta(days=days)
        training = Training(
            name=name,
            description=f"About {name}",
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=2),
            max_seats=10,
            created_by=admin,
            levels=levels,
            **fields,
        )
        db.add(training)
        db.flush()
        return training

    return _make_training


@pytest.fixture
def catalogue(make_training, make_user):
    """Trainings that cover every filter: level, past, cancelled, and date order."""
    trainer = make_user(name="Ana Silva", level=Level.ARCHITECT)
    return {
        "later_junior": make_training("Later junior", 10, [Level.JUNIOR, Level.EXPERT], trainer=trainer),
        "soon_junior": make_training("Soon junior", 2, [Level.JUNIOR]),
        "senior_only": make_training("Senior only", 5, [Level.SENIOR]),
        "past_junior": make_training("Past junior", -5, [Level.JUNIOR]),
        "cancelled_junior": make_training("Cancelled junior", 7, [Level.JUNIOR], cancelled_at=NOW),
    }


def names(response) -> list[str]:
    return [training["name"] for training in response.json()]


# --- GET /api/trainings ---


def test_without_a_token_is_401(client):
    assert client.get(URL).status_code == 401


def test_employee_sees_upcoming_uncancelled_trainings_for_their_level_soonest_first(
    client, junior, catalogue
):
    response = client.get(URL, headers=auth_headers(junior))

    assert response.status_code == 200
    assert names(response) == ["Soon junior", "Later junior"]


def test_employee_level_filter_is_ignored(client, junior, catalogue):
    response = client.get(URL, params={"level": "senior"}, headers=auth_headers(junior))

    assert names(response) == ["Soon junior", "Later junior"]


def test_admin_sees_everything_including_past_and_cancelled(client, admin, catalogue):
    response = client.get(URL, headers=auth_headers(admin))

    assert names(response) == [
        "Past junior",
        "Soon junior",
        "Senior only",
        "Cancelled junior",
        "Later junior",
    ]


def test_admin_can_filter_by_level(client, admin, catalogue):
    response = client.get(URL, params={"level": "senior"}, headers=auth_headers(admin))

    assert names(response) == ["Senior only"]


def test_unknown_level_filter_is_422(client, admin):
    assert client.get(URL, params={"level": "intern"}, headers=auth_headers(admin)).status_code == 422


def test_summary_shape_has_no_description(client, junior, catalogue):
    later = catalogue["later_junior"]

    [soon, later_json] = client.get(URL, headers=auth_headers(junior)).json()

    assert later_json == {
        "id": later.id,
        "name": "Later junior",
        "starts_at": later.starts_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ends_at": later.ends_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "levels": ["junior", "expert"],
        "trainer": {"id": later.trainer_id, "name": "Ana Silva"},
        "external_trainer_name": None,
        "max_seats": 10,
        "seats_left": 10,
        "cancelled": False,
        "my_enrollment_status": None,
        "my_enrollment_id": None,
        "average_rating": None,
        "rating_count": 0,
        "my_rating": None,
    }
    assert soon["trainer"] is None


# --- the N+1 problem ---


@contextmanager
def count_queries(db):
    """Counts the SQL statements sent through this test's connection."""
    statements: list[str] = []

    def before_cursor_execute(conn, cursor, statement, *args):
        statements.append(statement)

    engine = db.get_bind().engine
    event.listen(engine, "before_cursor_execute", before_cursor_execute)
    try:
        yield statements
    finally:
        event.remove(engine, "before_cursor_execute", before_cursor_execute)


def test_listing_uses_the_same_number_of_queries_for_2_or_20_trainings(
    client, db, admin, make_training, make_user
):
    headers = auth_headers(admin)

    def queries_for_listing(count: int) -> int:
        for i in range(count):
            # A different trainer each time, so lazy loading would cost one query per training
            trainer = make_user(name=f"Trainer {count}-{i}")
            make_training(f"T{count}-{i}", i + 1, [Level.JUNIOR, Level.SENIOR], trainer=trainer)
        db.expire_all()  # nothing cached: every training, trainer and level must be loaded
        with count_queries(db) as statements:
            client.get(URL, headers=headers)
        return len(statements)

    with_2 = queries_for_listing(2)
    with_20 = queries_for_listing(18)  # 20 in total now

    assert with_2 == with_20
    assert with_20 <= 3  # current user + trainings with trainers + all their levels


# --- GET /api/trainings/{id} ---


def test_detail_includes_the_description(client, junior, catalogue):
    training = catalogue["soon_junior"]

    response = client.get(f"{URL}/{training.id}", headers=auth_headers(junior))

    assert response.status_code == 200
    assert response.json()["description"] == "About Soon junior"
    assert response.json()["seats_left"] == 10


def test_unknown_id_is_404(client, junior):
    response = client.get(f"{URL}/999999", headers=auth_headers(junior))

    assert response.status_code == 404
    assert response.json() == {"detail": "Training not found"}


def test_training_for_another_level_is_404_for_employees(client, junior, catalogue):
    response = client.get(f"{URL}/{catalogue['senior_only'].id}", headers=auth_headers(junior))

    assert response.status_code == 404
    assert response.json() == {"detail": "Training not found"}  # same as a missing id


def test_admin_can_read_any_training(client, admin, catalogue):
    assert client.get(f"{URL}/{catalogue['senior_only'].id}", headers=auth_headers(admin)).status_code == 200


@pytest.mark.parametrize("key", ["past_junior", "cancelled_junior"])
def test_employee_can_still_open_past_and_cancelled_trainings_of_their_level(
    client, junior, catalogue, key
):
    body = client.get(f"{URL}/{catalogue[key].id}", headers=auth_headers(junior)).json()

    assert body["name"] == catalogue[key].name
    assert body["cancelled"] is (key == "cancelled_junior")


def test_detail_without_a_token_is_401(client, catalogue):
    assert client.get(f"{URL}/{catalogue['soon_junior'].id}").status_code == 401
