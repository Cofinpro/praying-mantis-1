from datetime import UTC, datetime

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.models import (
    Client,
    Enrollment,
    EnrollmentStatus,
    Expense,
    ExpenseStatus,
    Level,
    Notification,
    Seat,
    SeatReservation,
    Training,
    TrainingLevel,
    User,
)
from app.security import hash_password, verify_password
from app.services import expenses
from app.seed import (
    SEED_ENROLLMENTS,
    SEED_PASSWORD,
    SEED_TRAININGS,
    SEED_EXPENSES,
    SEED_USERS,
    seed,
    seed_enrollments,
    seed_expenses,
    seed_notifications,
    seed_reservations,
    seed_seats,
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

        assert len(users) == len(SEED_USERS) == 18
        assert {u.level for u in users} == set(Level)
        assert {u.client for u in users} == set(Client)
        # Alex Admin, Bernardo and Diogo
        assert {u.email for u in users if u.is_admin} == {
            "admin@cofinpro.pt",
            "bernardo.santos@cofinpro.pt",
            "diogo.santos@cofinpro.pt",
        }
        assert {u.email for u in users if u.is_hr} == {"helena@cofinpro.pt"}
        assert sum(u.is_team_lead for u in users) == 3
        assert any(u.team_lead is None and not u.is_admin and not u.is_team_lead for u in users)

    def test_running_twice_creates_no_duplicates(self, db):
        seed(db)
        seed(db)

        assert db.scalar(select(text("COUNT(*)")).select_from(User)) == 18

    def test_rerun_restores_changed_seed_data(self, db):
        seed(db)
        joao = db.scalar(select(User).where(User.email == "joao@cofinpro.pt"))
        joao.team_lead = None
        joao.level = Level.ARCHITECT
        db.commit()

        seed(db)
        db.refresh(joao)

        assert joao.level == Level.JUNIOR
        assert joao.team_lead.email == "sofia@cofinpro.pt"

    def test_seed_password_works_and_names_keep_accents(self, db):
        seed(db)
        db.expire_all()  # force a fresh read from MySQL
        ines = db.scalar(select(User).where(User.email == "ines@cofinpro.pt"))

        assert ines.name == "Inês Rocha"
        assert verify_password(SEED_PASSWORD, ines.password_hash)


    def test_keep_existing_leaves_changed_users_alone(self, db):
        from app.seed import email_for

        seed(db)
        sofia = db.scalar(select(User).where(User.email == email_for("sofia")))
        sofia.level = Level.SENIOR
        sofia.password_hash = hash_password("sofias-own-password")
        db.flush()

        seed(db, keep_existing=True)

        db.refresh(sofia)
        assert sofia.level == Level.SENIOR
        assert verify_password("sofias-own-password", sofia.password_hash)

    def test_renames_users_from_the_old_domain_instead_of_duplicating_them(self, db):
        old = User(
            name="Sofia Martins",
            email="sofia@preyingmantis.test",
            password_hash="x",
            client=Client.DKB,
            level=Level.ARCHITECT,
        )
        db.add(old)
        db.flush()

        seed(db)

        assert db.scalar(select(User).where(User.email == "sofia@preyingmantis.test")) is None
        assert db.scalar(select(User).where(User.email == "sofia@cofinpro.pt")).id == old.id
        assert db.scalar(select(text("COUNT(*)")).select_from(User)) == 18


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

        assert deciders == {"sofia@cofinpro.pt", "tiago@cofinpro.pt", "ines@cofinpro.pt", "admin"}

    def test_past_trainings_have_approved_enrollments(self, seeded):
        now = datetime.now(UTC)

        assert any(e.status == EnrollmentStatus.APPROVED and e.training.ends_at < now for e in seeded)

    def test_no_seed_times_are_in_the_future(self, seeded):
        now = datetime.now(UTC)

        assert all(e.requested_at <= now and (e.decided_at is None or e.decided_at <= now) for e in seeded)
        assert all(e.decided_at is None or e.decided_at > e.requested_at for e in seeded)

    def test_seed_follows_the_level_rule(self, seeded):
        assert all(e.user.level in e.training.levels for e in seeded)

    def test_running_twice_creates_no_duplicates(self, db, seeded):
        seed_enrollments(db)

        assert db.scalar(select(text("COUNT(*)")).select_from(Enrollment)) == len(SEED_ENROLLMENTS)


class TestSeedExpenses:
    def test_something_waits_at_each_step_and_reruns_dont_duplicate(self, db):
        seed(db)
        seed_expenses(db)
        seed_expenses(db)

        rows = db.scalars(select(Expense)).all()
        assert len(rows) == len(SEED_EXPENSES)
        assert {e.status for e in rows} == set(ExpenseStatus) - {ExpenseStatus.WITHDRAWN}
        by_email = {u.email: u for u in db.scalars(select(User))}
        assert [e.title for e in expenses.to_decide(db, by_email["sofia@cofinpro.pt"])] == ["Taxi to DKB's office"]
        assert len(expenses.to_decide(db, by_email["helena@cofinpro.pt"])) == 2


class TestSeedNotifications:
    def test_every_decider_has_a_request_and_reruns_dont_duplicate(self, db):
        seed(db)
        seed_trainings(db)
        seed_enrollments(db)
        first = len(seed_notifications(db))
        second = len(seed_notifications(db))

        assert first == second == db.scalar(select(text("COUNT(*)")).select_from(Notification))
        sofia = db.scalar(select(User).where(User.email == "sofia@cofinpro.pt"))
        assert any(n.user_id == sofia.id and n.link == "/approvals" for n in db.scalars(select(Notification)))


class TestSeedSeats:
    def test_ten_seats_per_client_zone_in_a_5_by_2_grid(self, db):
        seats = seed_seats(db)

        assert len(seats) == 50
        for zone in Client:
            in_zone = [s for s in seats if s.zone == zone]
            assert len(in_zone) == 10
            assert {(s.pos_x, s.pos_y) for s in in_zone} == {(x, y) for x in range(5) for y in range(2)}

    def test_labels_match_the_design(self, db):
        labels = {s.label for s in seed_seats(db)}

        assert {"DKB-01", "DKB-03", "DEKA-10", "UNION-10"} <= labels
        seat = db.scalar(select(Seat).where(Seat.label == "DKB-07"))
        assert (seat.zone, seat.pos_x, seat.pos_y) == (Client.DKB, 1, 1)

    def test_running_twice_creates_no_duplicates(self, db):
        seed_seats(db)
        seed_seats(db)

        assert db.scalar(select(text("COUNT(*)")).select_from(Seat)) == 50

    def test_two_seats_cant_share_a_cell(self, db):
        seed_seats(db)
        db.add(Seat(label="DKB-99", zone=Client.DKB, pos_x=0, pos_y=0))

        with pytest.raises(IntegrityError):
            db.flush()
        db.rollback()


class TestSeedReservations:
    def test_reservations_follow_the_rules_and_reruns_add_nothing(self, db):
        seed(db)
        seed_seats(db)
        first = seed_reservations(db)
        second = seed_reservations(db)

        assert len(first) == 9 and second == []
        for r in first:
            assert r.date.weekday() < 5
            assert r.seat.zone == r.user.client  # only in your own zone

    def test_a_real_booking_wins_over_the_seed(self, db):
        seed(db)
        seats = {s.label: s for s in seed_seats(db)}
        from app.seed import next_weekdays

        day = next_weekdays(1)[0]
        sofia = db.scalar(select(User).where(User.email == "sofia@cofinpro.pt"))
        other = db.scalar(select(User).where(User.email == "marta@cofinpro.pt"))
        db.add(SeatReservation(seat_id=seats["DKB-03"].id, user_id=other.id, date=day))  # Sofia's seed seat
        db.add(SeatReservation(seat_id=seats["DKB-09"].id, user_id=sofia.id, date=day))  # Sofia already has one
        db.flush()

        seed_reservations(db)  # must not raise

        assert db.scalar(select(SeatReservation).where(SeatReservation.seat_id == seats["DKB-03"].id,
                                                       SeatReservation.date == day)).user_id == other.id
