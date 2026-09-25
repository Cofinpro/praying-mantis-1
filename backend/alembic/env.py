from logging.config import fileConfig

from sqlalchemy import create_engine, pool

from alembic import context
from app.config import settings
from app.models import Base  # importing app.models registers every table

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
# disable_existing_loggers=False keeps pytest's and the app's loggers working
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# The models' MetaData, for 'autogenerate' support
target_metadata = Base.metadata

# The DB URL comes from app.config (backend/.env), not from alembic.ini
database_url = settings.database_url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode: emit SQL to stdout without a DB connection."""
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode: connect to the DB and apply them."""
    # tests/conftest.py passes its own connection (to the test database)
    connection = config.attributes.get("connection")
    if connection is not None:
        do_run_migrations(connection)
        return

    connectable = create_engine(database_url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        do_run_migrations(connection)


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
