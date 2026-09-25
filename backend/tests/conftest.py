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

BACKEND_DIR = Path(__file__).resolve().parent.parent
TEST_DB_NAME = f"{settings.db_name}_test"


@pytest.fixture(scope="session")
def engine():
    # Safety net: never drop anything that isn't a *_test database
    assert TEST_DB_NAME.endswith("_test")

    # Connect to the server without selecting a database, to (re)create the test DB
    server_engine = create_engine(settings.url_for(None))
    with server_engine.connect() as conn:
        conn.execute(text(f"DROP DATABASE IF EXISTS `{TEST_DB_NAME}`"))
        conn.execute(text(f"CREATE DATABASE `{TEST_DB_NAME}`"))
    server_engine.dispose()

    engine = create_engine(settings.url_for(TEST_DB_NAME))

    # Build the schema exactly like production does: through the migrations
    alembic_cfg = Config(BACKEND_DIR / "alembic.ini")
    with engine.begin() as conn:
        alembic_cfg.attributes["connection"] = conn
        command.upgrade(alembic_cfg, "head")

    yield engine
    engine.dispose()


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
