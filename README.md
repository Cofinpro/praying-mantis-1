# praying-mantis-1

```
            \         /
             \  ___  /
              (o   o)
               \ v /
          ,____/| |\____,
          \_   \| |/   _/
            \__/| |\__/
                | |
                |=|
               /| |\
              / | | \
             /  | |  \
            /   |_|   \
       ~~~~~~~~~~~~~~~~~~~~~
```

**PreyingMantis** is an internal company platform that brings existing systems together in one place. It lets you **book trainings** (a team lead approves each request) and **reserve a seat in the office**. Timesheets and Vacations belong to other teams and only appear as links.

- **Backend:** Python, FastAPI, SQLAlchemy, MySQL 8 (`backend/`)
- **Frontend:** React 19 + TypeScript on Vite, with pnpm (`frontend/`)
- **Live frontend** (on mock data): https://cofinpro.github.io/praying-mantis-1/
- **Board:** Jira project [SCRUM](https://bernardo-santos-cofinpro.atlassian.net)

## Requirements

Docker Desktop, Python 3.12+, Node 24 and pnpm.

## Run it locally

**1. Database**, from the repo root:

```sh
docker compose up -d      # MySQL 8 on localhost:3306
```

Port 3306 must be free. If MySQL is installed locally, stop it first (`brew services stop mysql`).

**2. Backend**, in `backend/`:

```sh
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
alembic upgrade head      # create the tables
python -m app.seed        # add the test users
fastapi dev app/main.py   # http://localhost:8000, API docs at /docs
```

**3. Frontend**, in `frontend/`:

```sh
pnpm install
cp .env.example .env.local
pnpm dev                  # http://localhost:5173, against the backend
```

To work on the frontend without a backend, run `pnpm dev:mock` instead. The API calls are then answered by mocks.

## Test logins

Every seed user has the password `password123`. For example:

| Email | Role |
|---|---|
| `admin@preyingmantis.test` | Admin |
| `sofia@preyingmantis.test` | Team lead |
| `joao@preyingmantis.test` | Employee (reports to Sofia) |

The full list is in `backend/app/seed.py`.

## Tests and checks

```sh
# backend/ (needs the database running)
pytest
alembic check             # models and migrations are in sync

# frontend/
pnpm lint
pnpm build
pnpm test
```

These also run in CI on every PR.

## Common tasks

- **Changed a model?** Run `alembic revision --autogenerate -m "..."` in `backend/`, read the generated file, then run `alembic upgrade head`.
- **Changed the API?** With the backend running, run `pnpm gen:api` in `frontend/` and commit `src/api/schema.d.ts`.
- **Reset the database:** `docker compose down -v && docker compose up -d`, then run the migrations and the seed again.

## Workflow

Each Jira story gets a branch named after it (e.g. `SCRUM-12-be-login`) and a PR to `main`. PRs need green CI but no review. Merging to `main` deploys the frontend.

## More

- `plan.md`: data model, user stories and milestones
- `decisions.md`: why things are the way they are
- `learnings.md`: notes on the stack, compared with Vue and Java
