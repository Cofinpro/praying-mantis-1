# praying-mantis-1

Coding dojo project: a FastAPI backend and a React frontend. The product is called **PreyingMantis** (the repo keeps the name `praying-mantis-1`).

The full plan (data model, decisions, user stories, milestones) is in `plan.md`. The stories are tracked in Jira: project **SCRUM** ("Coding dojo") at https://bernardo-santos-cofinpro.atlassian.net.

## Project explanation

We are building an internal company platform that brings existing systems together in one place. Its features:

| Feature | Owner | In scope? |
|---|---|---|
| Book trainings | us | ✅ |
| Reserve seats in the office | us | ✅ |
| Timesheets | another group, another tech stack | ❌ (a nav link at most) |
| Vacations | another group | ❌ (a nav link at most) |
| Expense sheets | nobody yet | ❌ |

**Tech stack:**
- **Backend:** Python, FastAPI, SQLAlchemy (sync), MySQL
- **Frontend:** React + TypeScript on Vite, with pnpm

A second goal is **learning** these technologies, so we prefer the approach that teaches something over a shortcut that hides it.

We are **experienced developers**, new to this stack: one comes from **Vue**, the other from **Java**. Skip general frontend/backend basics in explanations and in `learnings.md`. Focus on what's specific to React, Python, FastAPI, SQLAlchemy and MySQL, and on how it differs from Vue and from Java/Spring/JPA.

## Team and workflow

Two developers:
- **Diogo** (BE dev): backend and database. Stories are `BE-x.y`, with the Jira labels `backend` and `diogo`, assigned to him.
- **Bernardo** (FE dev): frontend. Stories are `FE-x.y`, with the Jira labels `frontend` and `bernardo`, assigned to him.

Everything is built in **one day**. The Jira board holds all issues in a single "Build day" sprint, ranked in build order. Take the top card in your lane whose blockers ("is blocked by" links) are done.

For every feature:
1. **Together**: agree the questions, the screens and the **API contract** (endpoints, JSON, error codes). Jira label: `together`.
2. **In parallel**: BE implements the contract. FE builds against MSW mocks that follow the contract.
3. **Integrate**: FE switches from the mocks to the real API.
4. **Demo and reflect**: add entries to `learnings.md`.

Each story gets its own branch and PR (e.g. `SCRUM-12-be-login`). PRs are a record of each story, not a gate: **no reviews and no requested reviewers**.

## Data model

This is the target model, a refined version of our first sketch (see `plan.md` §4 for the reasons). Tables are snake_case and plural; SQLAlchemy models are singular.

- **users**: name, email (unique), password_hash, client (`DKB|Deka|VV|DBIS|UNION`), level (`junior|expert|senior|architect|senior_architect`), is_admin, team_lead_id → users (nullable)
  - "Is team lead" is **derived** (someone has you as `team_lead_id`), not stored
  - "Privileged account" = `is_admin`
- **trainings**: name, description, starts_at and ends_at (**UTC**), max_seats, trainer_id → users (NULL = **External**), external_trainer_name (optional), created_by, cancelled_at (soft cancel)
- **training_levels**: (training_id, level). A training can target several levels.
- **enrollments**: training_id, user_id, status (`pending|approved|rejected|withdrawn`), decision_comment, requested_at, decided_by, decided_at
  - UNIQUE (training_id, user_id)
- **notifications**: user_id, type, message, link, read_at, created_at
- **seats**: label (unique, e.g. `DKB-03`), zone (same `Client` enum as users), pos_x and pos_y (grid position on the map)
- **seat_reservations**: seat_id, user_id, date
  - UNIQUE (seat_id, date) and UNIQUE (user_id, date): one person per seat and one seat per person per day

**Derived values:**
- *Seats left* = max_seats − approved enrollments
- *Completed training* = an approved enrollment whose training has ended and isn't cancelled

## Feature workflow

### Booking trainings

1. An **admin** creates a training with name, description, start and end, trainer (a user or External), one or more skill levels, and max seats.
2. Employees open the **Trainings** tab. They see upcoming trainings for **their own level**, open one, read the description, and **request to join**. That creates a `pending` enrollment.
3. The employee's **team lead** gets a notification (email is a stretch goal) and **approves or rejects** it on the **Approvals** page. Approval re-checks capacity. Users without a team lead are approved by an admin.
4. The employee gets a notification with the result. They can withdraw while the enrollment is pending or approved, as long as the training hasn't started.
5. The **Profile** tab shows upcoming, pending and completed trainings.

Status flow: `pending → approved | rejected`; `pending | approved → withdrawn`.

### Reserving seats

1. On the **Seats** tab the user picks a day and sees a map of all seats.
2. Colours: **white = free**, **red = taken**, **green = mine**, **greyed = another client's zone** (not clickable). Hovering a taken seat shows who took it.
3. Clicking a free seat in the user's own client zone reserves it for that day. If the user already has a seat that day, the reservation moves.
4. Default rules until we decide otherwise:
   - bookings up to 2 weeks ahead
   - no weekends
   - no past days

## Layout

What exists today:
- `docker-compose.yml`: local MySQL 8 with a named volume (`mysql-data`), a health check, and an init script that creates the test database `praying_mantis_test`
- `backend/`: FastAPI + SQLAlchemy on MySQL (via PyMySQL)
  - `app/main.py`: creates the app, adds CORS, and includes every router under `/api`
  - `app/config.py`: `Settings` (pydantic-settings), read from env vars / `backend/.env`
  - `app/database.py`: engine, `SessionLocal`, `Base`, and the `get_db` dependency
  - `app/models/`: SQLAlchemy models. Import each one in `models/__init__.py`, or Alembic won't see it.
    - `enums.py`: `Client` and `Level` (`StrEnum`), and `enum_column()` to store them as VARCHAR
    - `user.py`: `User`, with `team_lead` / `reports` (self-referencing) and the derived `is_team_lead`
  - `app/schemas/`: Pydantic request/response models (the API contract)
  - `app/routers/`: one `APIRouter` per area. `health.py` has `/api/` and `/api/health/db`, `auth.py` has `/api/auth/login` and `/api/auth/me`.
  - `app/dependencies.py`: shared dependencies. `CurrentUser` (requires a valid token, gives the `User`) and `DbSession`.
  - `app/services/`: business rules, no HTTP concerns
  - `app/security.py`: password hashing (`pwdlib`, Argon2id) and JWT create/decode (`PyJWT`, HS256)
  - `app/seed.py`: local seed users (`python -m app.seed`)
  - `alembic/`: migrations (`alembic/versions/`). `env.py` reads the DB URL from `app.config`.
  - `tests/`: pytest. `conftest.py` provides the `db` and `client` fixtures (see Testing below).
  - `.env.example`: DB settings, `CORS_ORIGINS` and `JWT_SECRET`. Copy it to `backend/.env` (git-ignored).
- `frontend/`: React 19 + TypeScript on Vite, managed with **pnpm**
  - `src/main.tsx`: mounts `<RouterProvider>` (from `react-router/dom`) and loads Inter and the global CSS
  - `src/router.tsx`: the route table. `/login` stands alone; every other page is a child of `Layout`
  - `src/components/`: `Layout` (TopBar + `<Outlet />`), `TopBar`, `NavItem`, `Logo`, `Avatar`, `NotificationBell`, `PageHeader`. Each has a `.module.css`
  - `src/pages/`: one component per route (placeholders until their stories)
  - `src/config/navigation.ts`: the nav links, the external Timesheets/Vacations links, and the placeholder user
  - `src/styles/tokens.css`: the Figma variables as CSS custom properties
  - `public/404.html` + the inline script in `index.html`: deep links on GitHub Pages (see `decisions.md`)
  - `src/api/client.ts`: the only code that knows `VITE_API_URL`. `api.get<T>()` / `post` / `put` / `patch` / `delete`, throwing `ApiError` (`status`, `detail`, `code`) on non-2xx
  - `src/api/<area>.ts`: one function per endpoint (e.g. `health.ts` → `getHello()`). Pages call these, never `fetch`
  - `src/api/schema.d.ts`: generated by `pnpm gen:api` (don't edit)
  - `src/mocks/handlers.ts`: MSW handlers, one per endpoint, matching `*/api/...`. `browser.ts` starts the worker; `public/mockServiceWorker.js` is generated by MSW (don't edit)
  - `.env.mock`: sets `VITE_USE_MOCKS=true` for `pnpm dev:mock` (`vite --mode mock`)
- `.github/workflows/deploy-pages.yml`: builds `frontend/` and deploys it to GitHub Pages on every push to `main`
- `.github/workflows/backend-tests.yml`: runs `pytest` and `alembic check` against a MySQL service container on every PR that touches `backend/`

## Commands

### Database (Docker)

Requires Docker Desktop. Run from the repo root:

```sh
docker compose up -d      # start MySQL 8 on localhost:3306 (user app / password app, db praying_mantis)
docker compose ps         # wait until mysql shows "healthy"
docker compose stop       # stop it; data is kept in the mysql-data volume
docker compose down -v    # delete the container AND the data, for a clean reset
```

Port 3306 must be free. If MySQL is also installed locally (e.g. Homebrew), stop it first: `brew services stop mysql`.

### Backend

```sh
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt   # app + test dependencies
cp .env.example .env   # already matches docker-compose.yml
alembic upgrade head      # apply all migrations to the database
python -m app.seed        # add the seed users (safe to run again)
fastapi dev app/main.py   # http://localhost:8000, API docs at /docs
```

**Seed logins (local only):** every password is `password123`. Emails are `<first name>@preyingmantis.test`.

| Email | Client | Level | Role / team lead |
|---|---|---|---|
| `admin@preyingmantis.test` | DBIS | senior_architect | **Admin**, no team lead |
| `sofia@preyingmantis.test` | DKB | architect | **Team lead** of João, Marta, Pedro, Rita |
| `tiago@preyingmantis.test` | Deka | senior_architect | **Team lead** of Inês, Miguel, Carolina, Bruno |
| `ines@preyingmantis.test` | UNION | senior | **Team lead** of Beatriz, Hugo, Laura. Reports to Tiago |
| `joao@preyingmantis.test` | DKB | junior | Sofia |
| `marta@preyingmantis.test` | DKB | expert | Sofia |
| `pedro@preyingmantis.test` | VV | senior | Sofia |
| `rita@preyingmantis.test` | DBIS | junior | Sofia |
| `miguel@preyingmantis.test` | Deka | expert | Tiago |
| `carolina@preyingmantis.test` | Deka | junior | Tiago |
| `bruno@preyingmantis.test` | VV | architect | Tiago |
| `beatriz@preyingmantis.test` | UNION | expert | Inês |
| `hugo@preyingmantis.test` | UNION | junior | Inês |
| `laura@preyingmantis.test` | DBIS | senior | Inês |
| `rafael@preyingmantis.test` | VV | expert | **No team lead** (an admin approves his requests) |

Re-running the seed resets these users to the values above (matched by email) and never duplicates them.

**Trying the API with a login:** open http://localhost:8000/docs, call `POST /api/auth/login` with a seed login, copy the `access_token`, click **Authorize** and paste it. Every request from `/docs` then sends `Authorization: Bearer <token>`.

Check the database connection at http://localhost:8000/api/health/db (expects `{"database": "ok"}`).

Migrations (run from `backend/`):

```sh
alembic revision --autogenerate -m "add users"   # after changing models; ALWAYS read the generated file
alembic upgrade head      # apply
alembic downgrade -1      # undo the last one
alembic check             # fails if the models and the migrations are out of sync
```

Testing (run from `backend/`, with the Docker database running):

```sh
pytest                    # all tests
pytest tests/test_health.py -k root   # one file / tests matching a name
pytest -x                 # stop at the first failure
```

- Tests use a separate database, `<DB_NAME>_test` (`praying_mantis_test`). The session fixture drops and recreates it, then runs `alembic upgrade head`, so the migrations are tested too.
- Each test runs inside a transaction that is rolled back, so every test starts empty. Use the `client` fixture for API calls and `db` for direct DB access in the same transaction.
- The test database is created by `docker-compose.yml` only when the volume is **new**. With an older volume, either reset it (`docker compose down -v && docker compose up -d`) or run once: `docker exec -i praying-mantis-mysql mysql -uroot -proot -e "CREATE DATABASE IF NOT EXISTS praying_mantis_test; GRANT ALL ON praying_mantis_test.* TO 'app'@'%';"`
Allowed frontend origins are set by `CORS_ORIGINS` (comma-separated).

### Frontend

```sh
cd frontend
pnpm install
pnpm dev       # http://localhost:5173, against the real backend at VITE_API_URL
pnpm dev:mock  # same, but MSW answers every API call (no backend needed)
pnpm build     # tsc -b && vite build
pnpm lint      # oxlint
pnpm gen:api   # regenerate src/api/schema.d.ts from http://localhost:8000/openapi.json (backend running)
```

- Copy `frontend/.env.example` to `frontend/.env.local` (git-ignored) to change `VITE_API_URL` or `VITE_USE_MOCKS`.
- Run `pnpm gen:api` after every backend schema change and commit `schema.d.ts`, so the build never needs a running backend.

## Deployment

GitHub Pages hosts only the static frontend. The backend isn't deployed anywhere yet (story BE-7.1).
The Pages build uses `--base=/<repo-name>/` and reads the backend URL from the
repo variable `VITE_API_URL` (Settings → Secrets and variables → Actions → Variables).
Until a backend is deployed, the Pages build runs on the MSW mocks (`VITE_USE_MOCKS` defaults to `true` in the workflow; set the repo variable to `false` to use the real API).

## Conventions

- Use pnpm for the frontend, never npm or yarn.
- **API:**
  - REST + JSON, all routes under `/api` (routers are included with `prefix="/api"` in `main.py`)
  - Errors use FastAPI's `{"detail": ...}`. Business-rule conflicts return 409 with `{"detail": {"code": "...", "message": "..."}}`.
  - Datetimes are ISO 8601 in UTC (`...Z`), and dates are `YYYY-MM-DD`
- **Backend:**
  - DB access goes through the `get_db` dependency (`db: DbSession`)
  - An endpoint that needs a logged-in user takes `user: CurrentUser` (from `app/dependencies.py`). That's all it takes: missing, invalid or expired tokens get a 401 before the endpoint runs.
  - Business rules live in `services/`, not in routers
  - Pydantic schemas (`schemas/`) are the API contract; SQLAlchemy models (`models/`) are the database shape
  - Every schema change needs an Alembic migration (no `create_all`)
  - Enums are stored as VARCHAR (`Enum(..., native_enum=False)`)
  - Tests use pytest against a real MySQL test database (never SQLite). Every PR needs green CI.
- **Frontend:**
  - React Router (v8, data mode with `createBrowserRouter`) for pages, TanStack Query for server data, CSS Modules for styles
  - `BrowserRouter`-style URLs with `basename` = Vite's `BASE_URL`. Deep links on GitHub Pages work through `public/404.html`
  - Profile has no nav item: the avatar and name in the TopBar link to `/profile` (as in Figma)
  - Timesheets and Vacations are external nav items with `href: null` (shown disabled) until we get their URLs
  - Font: Inter via `@fontsource-variable/inter` (self-hosted, no Google Fonts)
  - `src/api/client.ts` is the only code that talks to the API. Every new endpoint gets a function in `src/api/<area>.ts` **and** an MSW handler in `src/mocks/handlers.ts`
  - Request/response types come from `schema.d.ts` (`components['schemas'][...]`). Hand-written types are only for endpoints without a `response_model` yet, and are marked as such
  - TypeScript API types are generated from `/openapi.json`
- **Design:**
  - Figma is the visual reference: [PreyingMantis — Design](https://www.figma.com/design/FFlbgdessRR1pHvP0MGpQh) (pages Foundations, Components, Screens). The spec is `docs/superpowers/specs/2026-09-25-figma-design-design.md`
  - The Figma team is on the Starter plan: max 3 pages per file, and about 20 MCP read calls a month, so prefer reviewing in Figma over screenshot tools. When the MCP quota is spent, the Figma REST API (`api.figma.com/v1/files/…`, `/v1/images/…`) with a personal access token still works. Keep the token out of the repo
  - Tokens in code live in `frontend/src/styles/tokens.css`. Text styles are `font` shorthands: `font: var(--font-h1)`
  - Cofinpro theming (from cofinpro.pt): orange `#FD6202`, ink `#131313`, accents green `#60D391`, purple `#8242D8`, blue `#006CFF`, font **Inter**, pill buttons, 16px card corners
  - Light mode only, desktop mocks only (1440 wide)
  - Design tokens: Figma variables and CSS custom properties share names (`color/text/primary` ↔ `--color-text-primary`). Components use only semantic tokens, never primitives or raw hex
  - `#FD6202` fails AA on white (3.0:1): use it for fills, the logo and large text only. Normal-size text, links and primary buttons use `orange/700` `#C24A00` (4.9:1)
  - Seat map colours: free = white, taken = crimson + lock icon, mine = Cofinpro green + check icon, other client = grey hatched. Never colour alone
- **Permissions:** the backend enforces all of them. Hiding buttons in the UI is only a convenience.
- **Docs:**
  - Record architectural or tooling choices in `decisions.md`
  - Record useful things to learn in `learnings.md`, grouped by topic (React, Python, FastAPI, SQLAlchemy, MySQL, …), since we're here to learn new tech
  - Keep `learnings.md` to stack-specific insights and comparisons with Vue / Java, not general programming basics
