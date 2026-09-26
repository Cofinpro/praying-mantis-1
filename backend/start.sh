#!/bin/sh
# Container entrypoint: migrate, optionally seed, then serve.
set -e

# Migrations run on every deploy, before the new version takes traffic.
# Alembic only applies the ones that are missing, so this is a no-op when up to date.
# Retry the first connection: a new container can start before the DB host
# resolves or accepts connections, and one failed connect would fail the deploy.
python -m app.wait_for_db

echo "Running migrations..."
alembic upgrade head

# Demo environments have no shell to run the seed by hand: SEED_ON_START=true
# runs it on every start (it's idempotent, see app/seed.py). Never in real production.
# --keep-existing: users that already exist keep their changes (passwords, levels, leads).
if [ "${SEED_ON_START:-false}" = "true" ]; then
    echo "Seeding demo data..."
    python -m app.seed --keep-existing
fi

# exec: the server replaces this shell, so it gets the host's stop signal directly
exec fastapi run app/main.py --host 0.0.0.0 --port "${PORT}"
