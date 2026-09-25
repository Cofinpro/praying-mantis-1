"""Two leads approve the last seat at the same moment. Exactly one may win.

The usual `db` fixture can't show this: everything in it runs on one connection
inside one rolled-back transaction. Here each "lead" gets its own connection and
really commits, so the rows are cleaned up by hand afterwards.
"""

import threading
import time
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.errors import Conflict
from app.models import Client, Enrollment, EnrollmentStatus, Level, Training, TrainingLevel, User
from app.services import enrollments as service


@pytest.fixture
def committed(engine):
    """A training with 1 seat and two pending requests from two different leads' reports."""
    with Session(engine, expire_on_commit=False) as db:
        def user(name, **fields):
            u = User(name=name, email=f"{name.lower()}@race.test", password_hash="x",
                     client=Client.DKB, level=Level.JUNIOR, **fields)
            db.add(u)
            return u

        admin = user("Admin", is_admin=True)
        lead_a, lead_b = user("LeadA"), user("LeadB")
        report_a, report_b = user("ReportA", team_lead=lead_a), user("ReportB", team_lead=lead_b)
        starts = datetime.now(UTC) + timedelta(days=3)
        training = Training(name="Last seat", description="x", starts_at=starts,
                            ends_at=starts + timedelta(hours=1), max_seats=1,
                            created_by=admin, levels=[Level.JUNIOR])
        db.add(training)
        db.flush()
        enrollment_a = Enrollment(training_id=training.id, user_id=report_a.id)
        enrollment_b = Enrollment(training_id=training.id, user_id=report_b.id)
        db.add_all([enrollment_a, enrollment_b])
        db.commit()
        data = {"training": training, "lead_a": lead_a, "lead_b": lead_b,
                "enrollment_a": enrollment_a, "enrollment_b": enrollment_b}

    yield data

    with Session(engine) as db:
        db.execute(delete(Enrollment).where(Enrollment.training_id == training.id))
        db.execute(delete(TrainingLevel).where(TrainingLevel.training_id == training.id))
        db.execute(delete(Training).where(Training.id == training.id))
        db.execute(delete(User).where(User.email.like("%@race.test")).where(User.team_lead_id.is_not(None)))
        db.execute(delete(User).where(User.email.like("%@race.test")))
        db.commit()


def test_two_leads_approving_the_last_seat(engine, committed, monkeypatch):
    real_count = service.count_approved

    def slow_count(db, training_id, locking=False):
        # Runs after the training row is locked: hold the lock a moment, so the
        # other lead's approval is already waiting for it
        time.sleep(0.5)
        return real_count(db, training_id, locking=locking)

    monkeypatch.setattr(service, "count_approved", slow_count)

    start = threading.Barrier(2)
    results: dict[str, str] = {}

    def approve_as(lead_key: str, enrollment_key: str) -> None:
        with Session(engine) as db:
            start.wait()  # both begin together
            try:
                service.approve(db, committed[lead_key], committed[enrollment_key].id)
                results[lead_key] = "approved"
            except Conflict as conflict:
                results[lead_key] = conflict.code

    threads = [
        threading.Thread(target=approve_as, args=("lead_a", "enrollment_a")),
        threading.Thread(target=approve_as, args=("lead_b", "enrollment_b")),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert sorted(results.values()) == ["approved", "training_full"]
    with Session(engine) as db:
        approved = db.scalar(
            select(func.count()).select_from(Enrollment).where(
                Enrollment.training_id == committed["training"].id,
                Enrollment.status == EnrollmentStatus.APPROVED,
            )
        )
    assert approved == 1  # never more than max_seats
