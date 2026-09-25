import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.models import Client, Level, User
from app.security import hash_password, verify_password
from app.seed import SEED_PASSWORD, SEED_USERS, seed


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
