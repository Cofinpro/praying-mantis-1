from datetime import UTC, datetime

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.models import Client, Enrollment, EnrollmentStatus, Level, Training, TrainingLevel, User
from app.security import hash_password, verify_password
from app.seed import (
    SEED_ENROLLMENTS,
    SEED_PASSWORD,
    SEED_TRAININGS,
    SEED_USERS,
    seed,
    seed_enrollments,
    seed_trainings,
)


def make_user(email: str, **overrides) -> User:
    fields = {
        "name": "Test User",
        "email": email,
        "password_hash": "not-a-real-hash",
        "client": Client.DKB,
        "level": Level.JUNIOR,
    } | overrides
    return User(**fields)


def test_enums_are_stored_as_their_values(db):
    db.add(make_user("enum@test.local", client=Client.DEKA, level=Level.SENIOR_ARCHITECT))
    db.flush()

    row = db.execute(text("SELECT client, level, is_admin FROM users")).one()

    assert row == ("Deka", "senior_architect", 0)


def test_email_is_unique(db):
    db.add(make_user("same@test.local"))
    db.flush()
    db.add(make_user("same@test.local"))

    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_team_lead_and_reports(db):
    lead = make_user("lead@test.local")
    report = make_user("report@test.local", team_lead=lead)
    db.add_all([lead, report])
    db.flush()

    assert report.team_lead_id == lead.id
    assert lead.reports == [report]
    assert lead.is_team_lead
    assert not report.is_team_lead


def test_deleting_a_lead_keeps_their_reports(db):
    lead = make_user("lead@test.local")
    report = make_user("report@test.local", team_lead=lead)
    db.add_all([lead, report])
    db.flush()
    report_id = report.id

    db.execute(text("DELETE FROM users WHERE id = :id"), {"id": lead.id})
    db.expire_all()

    assert db.get(User, report_id).team_lead_id is None


def test_password_hash_round_trip():
    hashed = hash_password("s3cret")

    assert hashed != "s3cret"
    assert verify_password("s3cret", hashed)
    assert not verify_password("wrong", hashed)


class TestSeed:
    def test_covers_every_level_client_and_role(self, db):
        seed(db)
        users = db.scalars(select(User)).all()

        assert len(users) == len(SEED_USERS) == 15
        assert {u.level for u in users} == set(Level)
        assert {u.client for u in users} == set(Client)
        assert sum(u.is_admin for u in users) == 1
        assert sum(u.is_team_lead for u in users) == 3
        assert any(u.team_lead is None and not u.is_admin and not u.is_team_lead for u in users)

    def test_running_twice_creates_no_duplicates(self, db):
        seed(db)
        seed(db)

        assert db.scalar(select(text("COUNT(*)")).select_from(User)) == 15

    def test_rerun_restores_changed_seed_data(self, db):
        seed(db)
        joao = db.scalar(select(User).where(User.email == "joao@preyingmantis.test"))
        joao.team_lead = None
        joao.level = Level.ARCHITECT
        db.commit()

        seed(db)
        db.refresh(joao)

        assert joao.level == Level.JUNIOR
        assert joao.team_lead.email == "sofia@preyingmantis.test"

    def test_seed_password_works_and_names_keep_accents(self, db):
        seed(db)
        db.expire_all()  # force a fresh read from MySQL
        ines = db.scalar(select(User).where(User.email == "ines@preyingmantis.test"))

        assert ines.name == "Inês Rocha"
        assert verify_password(SEED_PASSWORD, ines.password_hash)


class TestSeedTrainings:
    def test_covers_past_future_cancelled_external_and_full(self, db):
        seed(db)
        seed_trainings(db)
        trainings = db.scalars(select(Training)).all()
        now = datetime.now(UTC)

        assert len(trainings) == len(SEED_TRAININGS) == 8
        assert any(t.ends_at < now for t in trainings), "a past training"
        assert any(t.starts_at > now and not t.cancelled for t in trainings), "an upcoming training"
        assert any(t.cancelled for t in trainings), "a cancelled training"
        assert any(t.trainer is None and t.external_trainer_name for t in trainings), "External – name"
        assert any(t.trainer is None and not t.external_trainer_name for t in trainings), "External"
        assert any(t.max_seats <= 2 for t in trainings), "one that BE-3.1 can fill up"
        assert {level for t in trainings for level in t.levels} == set(Level)

    def test_running_twice_creates_no_duplicates(self, db):
        seed(db)
        seed_trainings(db)
        seed_trainings(db)

        assert db.scalar(select(text("COUNT(*)")).select_from(Training)) == 8
        level_rows = db.scalar(select(text("COUNT(*)")).select_from(TrainingLevel))
        assert level_rows == sum(len(t[4]) for t in SEED_TRAININGS)


class TestSeedEnrollments:
    @pytest.fixture
    def seeded(self, db):
        seed(db)
        seed_trainings(db)
        return seed_enrollments(db)

    def test_git_basics_is_full(self, db, seeded):
        git = db.scalar(select(Training).where(Training.name == "Git basics"))
        approved = [e for e in seeded if e.training_id == git.id and e.status == EnrollmentStatus.APPROVED]

        assert len(approved) == git.max_seats

    def test_every_team_lead_and_the_admin_has_a_pending_request(self, db, seeded):
        deciders = {
            (e.user.team_lead.email if e.user.team_lead else "admin")
            for e in seeded
            if e.status == EnrollmentStatus.PENDING
        }

        assert deciders == {"sofia@preyingmantis.test", "tiago@preyingmantis.test", "ines@preyingmantis.test", "admin"}

    def test_past_trainings_have_approved_enrollments(self, seeded):
        now = datetime.now(UTC)

        assert any(e.status == EnrollmentStatus.APPROVED and e.training.ends_at < now for e in seeded)

    def test_seed_follows_the_level_rule(self, seeded):
        assert all(e.user.level in e.training.levels for e in seeded)

    def test_running_twice_creates_no_duplicates(self, db, seeded):
        seed_enrollments(db)

        assert db.scalar(select(text("COUNT(*)")).select_from(Enrollment)) == len(SEED_ENROLLMENTS)
