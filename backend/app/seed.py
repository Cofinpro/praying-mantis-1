"""Fills the database with realistic users for local development.

Run from backend/:  python -m app.seed

Idempotent: users are matched by email, so running it again updates them
instead of creating duplicates. Every seed user's password is SEED_PASSWORD.
Local development only: never run this against a real environment.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Client, Level, User
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


def main() -> None:
    with SessionLocal() as db:
        users = seed(db)
        print(f"Seeded {len(users)} users. Every password is '{SEED_PASSWORD}'.")
        for user in users:
            lead = user.team_lead.name if user.team_lead else "-"
            admin = " (admin)" if user.is_admin else ""
            print(f"  {user.email:<32} {user.client:<6} {user.level:<17} lead: {lead}{admin}")


if __name__ == "__main__":
    main()
