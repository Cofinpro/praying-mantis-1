"""Shared pytest fixtures.

- ``engine`` (once per test run): drops and recreates the test database, then
  builds the schema with ``alembic upgrade head``, so the migrations are tested too.
- ``db`` (per test): a session inside a transaction that is rolled back at the end,
  so every test starts with a clean database.
- ``client`` (per test): a TestClient whose ``get_db`` dependency returns ``db``.
"""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.main import app
from app.models import Client, Level, User
from app.security import create_access_token

BACKEND_DIR = Path(__file__).resolve().parent.parent
TEST_DB_NAME = f"{settings.db_name}_test"


@pytest.fixture(scope="session")
def engine():
    # Safety net: never drop anything that isn't a *_test database
    assert TEST_DB_NAME.endswith("_test")

    # Connect to the server without selecting a database, to (re)create the test DB
    server_engine = create_engine(settings.url_for(None), connect_args=settings.db_connect_args)
    with server_engine.connect() as conn:
        conn.execute(text(f"DROP DATABASE IF EXISTS `{TEST_DB_NAME}`"))
        conn.execute(text(f"CREATE DATABASE `{TEST_DB_NAME}`"))
    server_engine.dispose()

    engine = create_engine(settings.url_for(TEST_DB_NAME), connect_args=settings.db_connect_args)

    # Build the schema exactly like production does: through the migrations
    alembic_cfg = Config(BACKEND_DIR / "alembic.ini")
    with engine.begin() as conn:
        alembic_cfg.attributes["connection"] = conn
        command.upgrade(alembic_cfg, "head")

    yield engine
    engine.dispose()


@pytest.fixture(autouse=True)
def no_real_email(monkeypatch):
    """Tests never send real email, even if backend/.env points at Mailpit."""
    monkeypatch.setattr(settings, "smtp_host", None)


@pytest.fixture
def db(engine):
    # One outer transaction per test, rolled back at the end.
    # "create_savepoint" turns the app's own session.commit() calls into
    # SAVEPOINT releases, so code under test can commit without escaping it.
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(db):
    """Factory: make_user(email="x@test.local", is_admin=True, ...) adds a user and returns it."""
    counter = 0

    def _make_user(**fields) -> User:
        nonlocal counter
        counter += 1
        defaults = {
            "name": f"User {counter}",
            "email": f"user{counter}@test.local",
            "password_hash": "not-a-real-hash",
            "client": Client.DKB,
            "level": Level.JUNIOR,
        }
        user = User(**(defaults | fields))
        db.add(user)
        db.flush()
        return user

    return _make_user


def auth_headers(user: User) -> dict[str, str]:
    """Headers that log a test request in as `user`."""
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}
