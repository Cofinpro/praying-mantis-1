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

**PreyingMantis** is an internal company platform where employees handle their everyday admin in one place:

- **Trainings:** request a course for your level; your team lead approves. Full courses have a waitlist, completed ones can be rated, and trainers share materials.
- **Seats:** pick a day on the office map and reserve a desk in your client's zone.
- **Expenses:** upload receipts; your team lead approves, then HR.
- **Around it:** notifications, reminders the day before, and for admins user management and reports with CSV export.

Timesheets and vacations are built by the other team ([praying-mantis-2](https://cofinpro.github.io/praying-mantis-2/)) and appear here as nav links.

- **Backend:** Python, FastAPI, SQLAlchemy, MySQL 8 (`backend/`), live at https://praying-mantis-api.onrender.com (API docs at `/docs`)
- **Frontend:** React 19 + TypeScript on Vite, with pnpm (`frontend/`), live at https://cofinpro.github.io/praying-mantis-1/
- **Board:** Jira project [SCRUM](https://bernardo-santos-cofinpro.atlassian.net)

The live backend runs on Render's free plan: after 15 idle minutes it sleeps, so the first request can take about a minute.

## Requirements

Docker Desktop, Python 3.12+, Node 24 and pnpm.

## Run it locally

**1. Database**, from the repo root:

```sh
docker compose up -d      # MySQL 8 on localhost:3306, plus Mailpit (sent emails) at http://localhost:8025
```

Port 3306 must be free. If MySQL is installed locally, stop it first (`brew services stop mysql`).

**2. Backend**, in `backend/`:

```sh
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
alembic upgrade head      # create the tables
python -m app.seed        # add the test users and demo data
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

Every seed user has the password `password123`, locally and on the live site. For example:

| Email | Role |
|---|---|
| `admin@cofinpro.pt` | Admin |
| `bernardo.santos@cofinpro.pt`, `diogo.santos@cofinpro.pt` | Admins |
| `helena@cofinpro.pt` | HR (second approval of expenses) |
| `sofia@cofinpro.pt` | Team lead |
| `joao@cofinpro.pt` | Employee (reports to Sofia) |

The full list is in `backend/app/seed.py`. Admins create more users, and give the admin or HR role, at **Users** in the app.

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

Each change gets its own branch (Jira stories are named after the story, e.g. `SCRUM-12-be-login`) and a PR to `main`. PRs need green CI but no review. Merging to `main` deploys the frontend to GitHub Pages and, when `backend/` changed, the backend to Render (which runs the migrations on start).

## More

- `plan.md`: data model, user stories and milestones
- `decisions.md`: why things are the way they are
- `learnings.md`: notes on the stack, compared with Vue and Java
- `Classroom.md`: React for Vue developers: a 15-minute tour, a deep dive, and what we learned building the later features, with exercises
- `CLAUDE.md`: the full project guide (layout, conventions, every command)
