from datetime import UTC, datetime, timedelta

import pytest

from app import email as email_module
from app.config import settings
from app.email import Email, send_email
from app.models import Level, Training
from app.routers import enrollments as enrollments_router
from tests.conftest import auth_headers


@pytest.fixture
def lead(make_user):
    return make_user(name="Sofia Martins", email="sofia@test.local", level=Level.ARCHITECT)


@pytest.fixture
def employee(make_user, lead):
    return make_user(name="João Silva", team_lead=lead)


@pytest.fixture
def training(db, make_user):
    starts_at = (datetime.now(UTC) + timedelta(days=7)).replace(hour=9, minute=0, second=0, microsecond=0)
    training = Training(
        name="Intro to FastAPI", description="x", starts_at=starts_at,
        ends_at=starts_at + timedelta(hours=2), max_seats=1,
        created_by=make_user(is_admin=True), levels=[Level.JUNIOR],
    )
    db.add(training)
    db.flush()
    return training


@pytest.fixture
def sent(monkeypatch) -> list[Email]:
    """Captures the emails the endpoint hands to BackgroundTasks, instead of sending them."""
    outbox: list[Email] = []
    monkeypatch.setattr(enrollments_router, "send_email", outbox.append)
    return outbox


def request_seat(client, user, training):
    return client.post(f"/api/trainings/{training.id}/enrollments", headers=auth_headers(user))


def test_a_request_emails_the_team_lead(client, employee, training, sent, monkeypatch):
    monkeypatch.setattr(settings, "app_url", "https://cofinpro.github.io/praying-mantis-1")

    assert request_seat(client, employee, training).status_code == 201

    [email] = sent
    assert email.to == "sofia@test.local"
    assert email.subject == "Approval needed: João Silva → Intro to FastAPI"
    assert "https://cofinpro.github.io/praying-mantis-1/approvals" in email.body


def test_no_team_lead_emails_every_admin(client, make_user, training, sent):
    admins = [make_user(is_admin=True, email=f"admin{i}@test.local") for i in range(2)]
    loner = make_user()

    request_seat(client, loner, training)

    assert {a.email for a in admins} <= {e.to for e in sent}  # every admin got one


def test_a_refused_request_sends_no_email(client, db, employee, training, sent):
    training.cancelled_at = datetime.now(UTC)
    db.flush()

    assert request_seat(client, employee, training).status_code == 409
    assert sent == []


def test_a_broken_mail_server_doesnt_break_the_request(client, employee, training, monkeypatch, caplog):
    # Real send_email, pointed at a port where nothing listens
    monkeypatch.setattr(settings, "smtp_host", "127.0.0.1")
    monkeypatch.setattr(settings, "smtp_port", 9)

    response = request_seat(client, employee, training)

    assert response.status_code == 201
    assert "Could not send email" in caplog.text


def test_without_smtp_host_email_is_switched_off(caplog):
    caplog.set_level("INFO", logger=email_module.__name__)

    assert send_email(Email(to="x@test.local", subject="Hi", body="...")) is False
    assert "switched off" in caplog.text
