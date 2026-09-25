"""Fills the database with realistic users and trainings for local development.

Run from backend/:  python -m app.seed

Idempotent: users are matched by email and trainings by name, so running it
again updates them instead of creating duplicates. Training dates are relative
to today, so re-running also moves them back into the future/past.
Every seed user's password is SEED_PASSWORD.
Local development only: never run this against a real environment.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Client, Level, Training, User
from app.security import hash_password

SEED_PASSWORD = "password123"
EMAIL_DOMAIN = "preyingmantis.test"

# (name, email local part, client, level, is_admin, team lead's email local part)
SEED_USERS: list[tuple[str, str, Client, Level, bool, str | None]] = [
    # Admin (privileged account), no team lead
    ("Alex Admin", "admin", Client.DBIS, Level.SENIOR_ARCHITECT, True, None),
    # Team leads. Inês is a lead who also reports to a lead.
    ("Sofia Martins", "sofia", Client.DKB, Level.ARCHITECT, False, None),
    ("Tiago Costa", "tiago", Client.DEKA, Level.SENIOR_ARCHITECT, False, None),
    ("Inês Rocha", "ines", Client.UNION, Level.SENIOR, False, "tiago"),
    # Sofia's reports
    ("João Silva", "joao", Client.DKB, Level.JUNIOR, False, "sofia"),
    ("Marta Lopes", "marta", Client.DKB, Level.EXPERT, False, "sofia"),
    ("Pedro Alves", "pedro", Client.VV, Level.SENIOR, False, "sofia"),
    ("Rita Gomes", "rita", Client.DBIS, Level.JUNIOR, False, "sofia"),
    # Tiago's reports (plus Inês)
    ("Miguel Sousa", "miguel", Client.DEKA, Level.EXPERT, False, "tiago"),
    ("Carolina Dias", "carolina", Client.DEKA, Level.JUNIOR, False, "tiago"),
    ("Bruno Pinto", "bruno", Client.VV, Level.ARCHITECT, False, "tiago"),
    # Inês's reports
    ("Beatriz Reis", "beatriz", Client.UNION, Level.EXPERT, False, "ines"),
    ("Hugo Ferreira", "hugo", Client.UNION, Level.JUNIOR, False, "ines"),
    ("Laura Mendes", "laura", Client.DBIS, Level.SENIOR, False, "ines"),
    # A regular employee without a team lead: an admin approves their requests
    ("Rafael Nunes", "rafael", Client.VV, Level.EXPERT, False, None),
]


L = Level
ALL_LEVELS = list(Level)

# (name, days from today, hours long, max seats, levels, trainer's email local part
#  or None for External, external trainer name, cancelled)
SEED_TRAININGS: list[tuple[str, int, int, int, list[Level], str | None, str | None, bool]] = [
    ("Intro to FastAPI", 7, 3, 12, [L.JUNIOR, L.EXPERT], "bruno", None, False),
    ("SQLAlchemy in depth", 10, 4, 8, [L.SENIOR, L.ARCHITECT], "sofia", None, False),
    ("React for Vue developers", 14, 3, 15, [L.JUNIOR, L.EXPERT, L.SENIOR], None, "Jane Doe", False),
    ("Clean Architecture", 21, 6, 10, [L.ARCHITECT, L.SENIOR_ARCHITECT], None, None, False),
    # Only 2 seats: BE-3.1 fills it up to test "training is full"
    ("Git basics", 3, 2, 2, [L.JUNIOR], "pedro", None, False),
    # Already happened: approved enrollments here count as "completed"
    ("Docker for developers", -14, 3, 10, [L.JUNIOR, L.EXPERT, L.SENIOR], "tiago", None, False),
    ("Agile estimation", -30, 2, 20, ALL_LEVELS, None, "Scrum.org", False),
    ("Kubernetes 101", 12, 4, 10, [L.EXPERT, L.SENIOR], "bruno", None, True),
]


def email_for(local_part: str) -> str:
    return f"{local_part}@{EMAIL_DOMAIN}"


def seed(db: Session) -> list[User]:
    """Creates or updates every seed user, then commits."""
    # Hash once: argon2 is slow on purpose, and every seed user shares the password
    password_hash = hash_password(SEED_PASSWORD)

    existing = {
        user.email: user
        for user in db.scalars(
            select(User).where(User.email.in_([email_for(u[1]) for u in SEED_USERS]))
        )
    }

    # Pass 1: create or update every user, without team leads
    users: dict[str, User] = {}
    for name, local_part, client, level, is_admin, _ in SEED_USERS:
        email = email_for(local_part)
        user = existing.get(email) or User(email=email)
        user.name = name
        user.password_hash = password_hash
        user.client = client
        user.level = level
        user.is_admin = is_admin
        db.add(user)
        users[local_part] = user

    # Pass 2: link team leads (they all exist now, even on the first run)
    for _, local_part, _, _, _, lead in SEED_USERS:
        users[local_part].team_lead = users[lead] if lead else None

    db.commit()
    return list(users.values())


def seed_trainings(db: Session) -> list[Training]:
    """Creates or updates every seed training (needs the seed users), then commits."""
    users = {
        user.email: user
        for user in db.scalars(select(User).where(User.email.like(f"%@{EMAIL_DOMAIN}")))
    }
    admin = users[email_for("admin")]
    existing = {
        training.name: training
        for training in db.scalars(
            select(Training).where(Training.name.in_([t[0] for t in SEED_TRAININGS]))
        )
    }
    today_9am = datetime.now(UTC).replace(hour=9, minute=0, second=0, microsecond=0)

    trainings = []
    for name, days, hours, max_seats, levels, trainer, external_name, cancelled in SEED_TRAININGS:
        training = existing.get(name) or Training(name=name, created_by=admin)
        training.description = f"{name}: a hands-on session with exercises. Bring your laptop."
        training.starts_at = today_9am + timedelta(days=days)
        training.ends_at = training.starts_at + timedelta(hours=hours)
        training.max_seats = max_seats
        training.levels = levels
        training.trainer = users[email_for(trainer)] if trainer else None
        training.external_trainer_name = external_name
        training.cancelled_at = training.starts_at - timedelta(days=2) if cancelled else None
        db.add(training)
        trainings.append(training)

    db.commit()
    return trainings


def main() -> None:
    with SessionLocal() as db:
        users = seed(db)
        print(f"Seeded {len(users)} users. Every password is '{SEED_PASSWORD}'.")
        for user in users:
            lead = user.team_lead.name if user.team_lead else "-"
            admin = " (admin)" if user.is_admin else ""
            print(f"  {user.email:<32} {user.client:<6} {user.level:<17} lead: {lead}{admin}")

        trainings = seed_trainings(db)
        print(f"Seeded {len(trainings)} trainings.")
        for t in trainings:
            if t.trainer:
                trainer = t.trainer.name
            else:
                trainer = " – ".join(filter(None, ["External", t.external_trainer_name]))
            status = " (cancelled)" if t.cancelled else ""
            print(f"  {t.starts_at:%Y-%m-%d} {t.name:<26} {t.max_seats:>2} seats  {trainer}{status}")


if __name__ == "__main__":
    main()
