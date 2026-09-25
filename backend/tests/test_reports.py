"""The admin Reports page: trainings with their requests and ratings, and people with what they completed."""

from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import event

from app.models import Enrollment, EnrollmentStatus, Level, Training, TrainingFeedback
from tests.conftest import auth_headers

NOW = datetime.now(UTC).replace(microsecond=0)
S = EnrollmentStatus


@pytest.fixture
def admin(make_user):
    return make_user(name="Alex Admin", is_admin=True, level=Level.SENIOR_ARCHITECT)


@pytest.fixture
def make_training(db, admin):
    def _make(name: str, starts_in: timedelta, hours: float = 2, **fields) -> Training:
        starts_at = NOW + starts_in
        training = Training(
            name=name,
            description="About it",
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=hours),
            max_seats=10,
            created_by=admin,
            levels=fields.pop("levels", [Level.JUNIOR]),
            **fields,
        )
        db.add(training)
        db.flush()
        return training

    return _make


def enroll(db, training, *people_and_statuses) -> None:
    for user, status in people_and_statuses:
        db.add(Enrollment(training_id=training.id, user_id=user.id, status=status))
    db.flush()


def rate(db, training, user, rating) -> None:
    db.add(TrainingFeedback(training_id=training.id, user_id=user.id, rating=rating))
    db.flush()


def get(client, admin, path, **params):
    return client.get(f"/api/admin/reports/{path}", headers=auth_headers(admin), params=params)


# --- trainings ---


def test_each_training_counts_its_requests_by_status_and_its_ratings(client, db, admin, make_user, make_training):
    past = make_training("Docker", -timedelta(days=10), external_trainer_name="Acme")
    a, b, c, d, e, f = (make_user() for _ in range(6))
    enroll(db, past, (a, S.APPROVED), (b, S.APPROVED), (c, S.REJECTED), (d, S.WITHDRAWN), (e, S.PENDING), (f, S.WAITLISTED))
    rate(db, past, a, 5)
    rate(db, past, b, 4)
    make_training("Git", timedelta(days=3), trainer=make_user(name="Pedro Alves"))

    rows = get(client, admin, "trainings").json()

    assert [(r["name"], r["trainer"]) for r in rows] == [("Git", "Pedro Alves"), ("Docker", "Acme")]  # newest first
    docker = rows[1]
    assert {k: docker[k] for k in ("waitlisted", "pending", "approved", "rejected", "withdrawn")} == {
        "waitlisted": 1, "pending": 1, "approved": 2, "rejected": 1, "withdrawn": 1,
    }
    assert (docker["average_rating"], docker["rating_count"]) == (4.5, 2)
    assert {k: rows[0][k] for k in ("approved", "pending", "average_rating", "rating_count")} == {
        "approved": 0, "pending": 0, "average_rating": None, "rating_count": 0,
    }


def test_cancelled_trainings_are_in_the_report(client, admin, make_training):
    make_training("Kubernetes", timedelta(days=5), cancelled_at=NOW)

    [row] = get(client, admin, "trainings").json()

    assert (row["name"], row["cancelled"], row["trainer"]) == ("Kubernetes", True, "External")


def test_trainings_can_be_filtered_by_start_day(client, admin, make_training):
    make_training("Too early", timedelta(days=-20))
    make_training("In range", timedelta(days=-5))
    make_training("Too late", timedelta(days=20))
    day = lambda delta: (NOW + timedelta(days=delta)).date().isoformat()  # noqa: E731

    rows = get(client, admin, "trainings", **{"from": day(-10), "to": day(-5)}).json()

    assert [r["name"] for r in rows] == ["In range"]


def test_to_before_from_is_a_422(client, admin):
    response = get(client, admin, "trainings", **{"from": "2026-10-10", "to": "2026-10-01"})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["query", "to"]


@contextmanager
def count_queries(db):
    statements: list[str] = []
    engine = db.get_bind().engine
    listener = lambda *args: statements.append(args[2])  # noqa: E731
    event.listen(engine, "before_cursor_execute", listener)
    try:
        yield statements
    finally:
        event.remove(engine, "before_cursor_execute", listener)


def test_the_training_report_costs_the_same_queries_for_2_or_20_trainings(client, db, admin, make_user, make_training):
    def queries_for(count: int) -> int:
        for i in range(count):
            training = make_training(f"T{count}-{i}", timedelta(days=i + 1), trainer=make_user())
            enroll(db, training, (make_user(), S.APPROVED))
        db.expire_all()
        with count_queries(db) as statements:
            get(client, admin, "trainings")
        return len(statements)

    assert queries_for(2) == queries_for(20)


# --- people ---


def test_people_show_completed_trainings_hours_and_upcoming(client, db, admin, make_user, make_training):
    lead = make_user(name="Sofia Martins")
    joao = make_user(name="João Silva", team_lead=lead)
    docker = make_training("Docker", -timedelta(days=10), hours=3)
    agile = make_training("Agile", -timedelta(days=30), hours=1.5)
    git = make_training("Git", timedelta(days=3))
    cancelled = make_training("K8s", -timedelta(days=2), cancelled_at=NOW - timedelta(days=5))
    rejected = make_training("SQL", -timedelta(days=4))
    enroll(db, docker, (joao, S.APPROVED))
    enroll(db, agile, (joao, S.APPROVED))
    enroll(db, git, (joao, S.APPROVED))
    enroll(db, cancelled, (joao, S.APPROVED))  # never took place: not completed
    enroll(db, rejected, (joao, S.REJECTED))

    rows = {r["name"]: r for r in get(client, admin, "people").json()}

    assert {k: rows["João Silva"][k] for k in ("team_lead", "completed", "completed_hours", "upcoming")} == {
        "team_lead": "Sofia Martins", "completed": 2, "completed_hours": 4.5, "upcoming": 1,
    }
    assert rows["João Silva"]["last_completed_at"] == docker.ends_at.isoformat().replace("+00:00", "Z")
    assert {k: rows["Sofia Martins"][k] for k in ("team_lead", "completed", "completed_hours", "last_completed_at", "upcoming")} == {
        "team_lead": None, "completed": 0, "completed_hours": 0, "last_completed_at": None, "upcoming": 0,
    }


def test_people_are_sorted_by_name(client, admin, make_user):
    make_user(name="Rita Costa")
    make_user(name="Bruno Reis")

    names = [r["name"] for r in get(client, admin, "people").json()]

    assert names == ["Alex Admin", "Bruno Reis", "Rita Costa"]


@pytest.mark.parametrize("path", ["trainings", "people"])
def test_reports_are_for_admins_only(client, make_user, path):
    response = client.get(f"/api/admin/reports/{path}", headers=auth_headers(make_user()))

    assert response.status_code == 403
