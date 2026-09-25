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
- **enrollments**: training_id, user_id, status (`waitlisted|pending|approved|rejected|withdrawn`), decision_comment, requested_at, decided_by, decided_at
  - UNIQUE (training_id, user_id)
- **notifications**: user_id, type, message, link, read_at, created_at
- **training_feedback**: training_id, user_id, rating 1–5, comment, created/updated_at. UNIQUE (training_id, user_id); only people who completed the training
- **training_materials**: training_id, filename, content_type, size, data (MEDIUMBLOB, deferred), uploaded_by_id, created_at. Max 10 MB per file, 20 per training
- **user_avatars**: user_id (PK), content_type, data (MEDIUMBLOB, deferred), updated_at
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

Status flow: `pending → approved | rejected`; `waitlisted | pending | approved → withdrawn`; `waitlisted → pending`.

**Waitlist** (see `decisions.md`): a full training offers "Join the waitlist" (`POST /api/trainings/{id}/waitlist`). When a place frees up (`max_seats > pending + approved`, after a withdrawal, rejection or more seats), the first in line becomes `pending` and is notified, and so is their team lead.

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
  - and **Mailpit**, a fake mail server: SMTP on `localhost:1025`, web inbox at http://localhost:8025
- `backend/`: FastAPI + SQLAlchemy on MySQL (via PyMySQL)
  - `app/main.py`: creates the app, adds CORS, and includes every router under `/api`
  - `app/config.py`: `Settings` (pydantic-settings), read from env vars / `backend/.env`
  - `app/database.py`: engine, `SessionLocal`, `Base`, and the `get_db` dependency
  - `app/models/`: SQLAlchemy models. Import each one in `models/__init__.py`, or Alembic won't see it.
    - `enums.py`: `Client` and `Level` (`StrEnum`), and `enum_column()` to store them as VARCHAR
    - `user.py`: `User`, with `team_lead` / `reports` (self-referencing) and the derived `is_team_lead`
    - `training.py`: `Training` and the `TrainingLevel` join table. `training.levels` reads/writes plain `Level`s through it.
    - `enrollment.py`: `Enrollment` (UNIQUE `training_id` + `user_id`), with `EnrollmentStatus` in `enums.py`
    - `notification.py`: `Notification` (type, message, link, read_at), with `NotificationType` in `enums.py`
    - `seat.py`: `Seat` (label, zone, pos_x, pos_y), UNIQUE label and UNIQUE (zone, pos_x, pos_y)
    - `reservation.py`: `SeatReservation` (seat_id, user_id, date), UNIQUE (seat_id, date) and UNIQUE (user_id, date)
    - `types.py`: `UtcDateTime`, the column type for every datetime the API exposes (stores UTC, returns aware UTC)
  - `app/schemas/`: Pydantic request/response models (the API contract)
  - `app/routers/`: one `APIRouter` per area. `health.py` has `/api/` and `/api/health/db`, `auth.py` has `/api/auth/login` and `/api/auth/me`, `users.py` has `/api/users` (admin only), `trainings.py` has `/api/trainings` (list, detail, create, `PATCH`, `/cancel`) and `GET /api/me/enrollments` (Profile), `enrollments.py` has `POST /api/trainings/{id}/enrollments`, `GET /api/approvals` and `POST /api/enrollments/{id}/approve` / `reject` / `withdraw`. `notifications.py` has `GET /api/notifications` and `POST /api/notifications/{id}/read` / `read-all`. `seats.py` has `GET /api/seats?date=` (the map), `POST /api/reservations`, `GET /api/reservations/me` and `DELETE /api/reservations/{id}`.
  - `app/dependencies.py`: shared dependencies. `CurrentUser` (requires a valid token, gives the `User`), `AdminUser` (also requires `is_admin`, else 403) and `DbSession`.
  - `app/services/`: business rules, no HTTP concerns. `enrollments.py` holds every enrollment rule (`request`, `approve`, `reject`, `withdraw`, `pending_for`, `can_decide`, `count_approved`). Status changes go through `check_move` (the state machine in `ALLOWED_MOVES`).
    `seats.py`: `check_booking_date` (Q14 rules, in the office time zone), `seat_map` (one LEFT JOIN query), `reserve` (move included), `my_upcoming`, `cancel`.
    `notifications.py`: `notify(db, recipients, type, message, link)` adds rows **without committing**; the calling service commits once, so an action and its notifications are one transaction.
  - `app/errors.py`: `NotFound` (→ 404), `Forbidden` (→ 403), `Conflict` (→ 409 with a `code`) and `ValidationFailed` (→ 422 in Pydantic's format), raised by services and turned into responses by handlers registered in `main.py`
  - `routers/materials.py` + `services/materials.py`: `GET/POST /api/trainings/{id}/materials`, `GET …/{material_id}/file`, `DELETE …/{material_id}` (admins and the trainer manage, everyone who can see the training downloads)
  - `routers/admin_reports.py` + `services/reports.py`: `GET /api/admin/reports/trainings` and `/people` (admin Reports page)
  - `app/scheduler.py`: the reminder loop (`remind_forever`), started by the lifespan in `main.py` every `REMINDERS_EVERY_MINUTES`. `services/reminders.py` has the rules (`send_due`); `routers/admin_reminders.py` has `POST /api/admin/reminders/run`
  - `app/email.py`: `send_email(Email)` over SMTP, never raises. Called only through `BackgroundTasks`. Emails are off when `SMTP_HOST` is unset (tests, Render).
  - `app/security.py`: password hashing (`pwdlib`, Argon2id) and JWT create/decode (`PyJWT`, HS256)
  - `app/seed.py`: local seed users (`python -m app.seed`)
  - `alembic/`: migrations (`alembic/versions/`). `env.py` reads the DB URL from `app.config`.
  - `tests/`: pytest. `conftest.py` provides the `db`, `client` and `make_user` fixtures and the `auth_headers(user)` helper (see Testing below).
  - `.env.example`: DB settings, `CORS_ORIGINS` and `JWT_SECRET`. Copy it to `backend/.env` (git-ignored).
  - `Dockerfile` + `start.sh`: the production image. On start it runs `alembic upgrade head`, optionally the seed (`SEED_ON_START=true`), then the server on `$PORT`.
- `frontend/`: React 19 + TypeScript on Vite, managed with **pnpm**
  - `src/main.tsx`: mounts `<RouterProvider>` (from `react-router/dom`) and loads Inter and the global CSS
  - `src/router.tsx`: the route table. `/login` stands alone; every other page is a child of `Layout`
  - `src/components/`: `Layout` (TopBar + `<Outlet />`), `TopBar` (with the logout button), `NavItem`, `Logo`, `Avatar`, `NotificationBell` (polls every 30 s, dropdown with mark-as-read), `PageHeader`, `AvatarEditor` (Profile: add/change/remove photo), `ChangePassword` (Profile), `FeedbackSection` + `StarRating`/`StarInput` (ratings on the detail page), `UserForm` (admin create/edit user), `JoinButton` + `WithdrawButton` (detail page), `ApprovalRow` (approvals page), `TrainingForm` (the create/edit training form, shared by `NewTrainingPage` and `EditTrainingPage`), `ConfirmDialog` (native `<dialog>`, `confirmVariant` danger or primary), and the form pieces `TextField` / `TextArea`, `CheckboxGroup`, `TrainerPicker` (searchable combobox, with "External"), `Button` / `ButtonLink` (`primary`, `secondary`, `ghost` or `danger`), `Alert` (error), `BackLink`, `SelectField`, `TrainingCard`, `LevelTag`, `StatusBadge`, and for seats `DayPicker`, `SeatMap` + `SeatLegend`, `Seat`, `ReserveSeatDialog` and `MyReservations`. `PageHeader` takes `actions` for page buttons on the right. Each has a `.module.css`
  - `src/auth/`: `AuthProvider` (the user from `/me`, `login()`, `logout()`), `useAuth()`, and `<RequireAuth>`, which wraps every route except `/login`
    - `permissions.ts`: `isAdmin`, `canApprove` (team lead or admin). Used by nav links (`visibleTo`), buttons and `<RequirePermission allow={...}>`, which shows `NotAllowedPage` in place of the page. Everything under `/admin` is guarded by `isAdmin`
  - `src/pages/`: one component per route (placeholders until their stories). `TrainingsPage` (cards + admin level filter) and `TrainingDetailPage` (details + the "Your place" action panel F3 fills in) read data with `useQuery`
  - `src/config/navigation.ts`: the nav links and the external Timesheets/Vacations links
  - `src/styles/tokens.css`: the Figma variables as CSS custom properties
  - `public/404.html` + the inline script in `index.html`: deep links on GitHub Pages (see `decisions.md`)
  - `src/api/client.ts`: the only code that knows `VITE_API_URL`. `api.get<T>()` / `post` / `put` / `patch` / `delete`, throwing `ApiError` (`status`, `detail`, `code`) on non-2xx. It also stores the login token (`authToken`, localStorage), sends it as `Authorization: Bearer`, and on a 401 clears it and logs out (except for `{ anonymous: true }` calls, i.e. login)
  - `src/api/<area>.ts`: one function per endpoint (e.g. `health.ts` → `getHello()`, `trainings.ts` → `createTraining()`, `users.ts` → `searchUsers()`). Pages call these, never `fetch`
  - `src/api/queryClient.ts`: `createQueryClient()` (TanStack Query, mounted in `main.tsx`) and `queryKeys`. Server data is read with `useQuery` and a key from `queryKeys`, not with `useEffect`
  - `src/trainings/levels.ts` (`LEVELS`, `levelLabel`, `isLevel`) and `display.ts` (trainer, seats and status labels)
  - `src/enrollments/`: `joinState.ts` (the join button's state, derived from the training) and `messages.ts` (409/403 `code` → message)
  - `src/trainings/trainingForm.ts`: the create-training form's state type, validation (mirrors the backend's `TrainingCreate`), request building (local → UTC) and 422 → field mapping
  - `src/components/MaterialsSection.tsx`: the training's files on the detail page (download; add/delete for admins and the trainer). `src/lib/download.ts` (`saveFile`) saves a Blob; `api.blob(path)` in `client.ts` fetches one with the token
  - `src/lib/csv.ts`: `toCsv(columns, rows)` (quoting, formula-injection guard) and `downloadCsv(filename, csv)`, used by `AdminReportsPage` (`/admin/reports`)
  - `src/lib/datetime.ts` (local ↔ UTC helpers), `src/lib/days.ts` (local calendar days for the seat map), `src/lib/image.ts` (shrink a photo to a 256 px JPEG) and `src/hooks/` (`useDebouncedValue`)
  - `src/api/schema.d.ts`: generated by `pnpm gen:api` (don't edit)
  - `src/mocks/handlers.ts`: MSW handlers, one per endpoint, matching `*/api/...`. `browser.ts` starts the worker; `public/mockServiceWorker.js` is generated by MSW (don't edit)
  - `src/mocks/server.ts`: the same handlers for tests, through `msw/node`
  - `src/mocks/data/trainings.ts`: mock trainings with dates relative to today, filtered like the backend
  - `src/mocks/data/users.ts`: the seed users (a copy of `backend/app/seed.py`). The login mock accepts them with `password123` and returns `mock-token-<id>`
  - `src/test/`: `setup.ts` (jest-dom matchers, MSW server, cleanup, clears localStorage) and `render.tsx` (`renderRoute(path)` mounts the real routes in a memory router inside `AuthProvider`; `storeLoginToken(email)` starts a test logged in)
  - `*.test.tsx`: Vitest + React Testing Library tests, next to the code they test. They run in `Europe/Lisbon` time (set in `vite.config.ts`)
  - `.env.mock`: sets `VITE_USE_MOCKS=true` for `pnpm dev:mock` (`vite --mode mock`)
- `.github/workflows/deploy-pages.yml`: builds `frontend/` and deploys it to GitHub Pages on every push to `main`
- `.github/workflows/frontend-checks.yml`: runs `pnpm lint`, `pnpm build` and `pnpm test` on every PR that touches `frontend/`
- `.github/workflows/wake-backend.yml`: wakes the sleeping Render backend at 07:00 and 16:00 UTC on working days, so due reminders go out
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

Emails sent locally (approval requests) show up in Mailpit's inbox at http://localhost:8025.

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

**Seed logins** (local, and the Render demo): every password is `password123`. Emails are `<first name>@cofinpro.pt`, plus `bernardo.santos@` and `diogo.santos@` for the two of us.

| Email | Client | Level | Role / team lead |
|---|---|---|---|
| `admin@cofinpro.pt` | DBIS | senior_architect | **Admin**, no team lead |
| `sofia@cofinpro.pt` | DKB | architect | **Team lead** of João, Marta, Pedro, Rita |
| `tiago@cofinpro.pt` | Deka | senior_architect | **Team lead** of Inês, Miguel, Carolina, Bruno |
| `ines@cofinpro.pt` | UNION | senior | **Team lead** of Beatriz, Hugo, Laura. Reports to Tiago |
| `joao@cofinpro.pt` | DKB | junior | Sofia |
| `marta@cofinpro.pt` | DKB | expert | Sofia |
| `pedro@cofinpro.pt` | VV | senior | Sofia |
| `rita@cofinpro.pt` | DBIS | junior | Sofia |
| `miguel@cofinpro.pt` | Deka | expert | Tiago |
| `carolina@cofinpro.pt` | Deka | junior | Tiago |
| `bruno@cofinpro.pt` | VV | architect | Tiago |
| `beatriz@cofinpro.pt` | UNION | expert | Inês |
| `hugo@cofinpro.pt` | UNION | junior | Inês |
| `laura@cofinpro.pt` | DBIS | senior | Inês |
| `rafael@cofinpro.pt` | VV | expert | **No team lead** (an admin approves his requests) |
| `bernardo.santos@cofinpro.pt` | DBIS | senior_architect | **Admin**, no team lead |
| `diogo.santos@cofinpro.pt` | DBIS | senior_architect | **Admin**, no team lead |

Re-running the seed resets these users to the values above (matched by email) and never duplicates them. `python -m app.seed --keep-existing` (what Render runs on every start) only creates missing users, so passwords and edits made in the app survive restarts.

Admins manage users at `/admin/users` (create, edit, set team lead, make admin, reset password). Everyone can change their own password on the Profile page.

**Seed trainings** (created by the admin, dates relative to the day you run the seed, 09:00 UTC):

| Training | When | Seats | Levels | Trainer |
|---|---|---|---|---|
| Intro to FastAPI | +7 days | 12 | junior, expert | Bruno |
| SQLAlchemy in depth | +10 days | 8 | senior, architect | Sofia |
| React for Vue developers | +14 days | 15 | junior, expert, senior | External – Jane Doe |
| Clean Architecture | +21 days | 10 | architect, senior_architect | External |
| Git basics | +3 days | **2** (to test "full") | junior | Pedro |
| Docker for developers | −14 days (past) | 10 | junior, expert, senior | Tiago |
| Agile estimation | −30 days (past) | 20 | all | External – Scrum.org |
| Kubernetes 101 | +12 days, **cancelled** | 10 | expert, senior | Bruno |

Trainings are matched by name, so re-running moves their dates relative to today again.

**Seed enrollments:**
- **Git basics is full**: João and Carolina approved (2 of 2 seats)
- **Pending, one per decider**: Rita → Intro to FastAPI (Sofia decides), Miguel → React for Vue developers (Tiago), Hugo → Intro to FastAPI and Beatriz → React for Vue developers (Inês), Rafael → Intro to FastAPI (**admin**, he has no team lead)
- **Other outcomes**: Laura approved for SQLAlchemy in depth, Pedro **rejected** for React for Vue developers (so he can't request it again), Marta **withdrawn** from Intro to FastAPI (so she can request it again)
- **Completed** (approved, past): Docker for developers (João, Marta, Pedro), Agile estimation (Sofia, Bruno). Laura was rejected for Agile estimation.
- **Notifications** are rebuilt from these on every seed run: a request notification for each decider, and an approved/rejected one for each decided enrollment (older ones already read).

**Seed seats (office layout):** one zone per client (`DKB`, `Deka`, `VV`, `DBIS`, `UNION`), each a **5 × 2 grid**, 50 seats in total. `pos_x` is the column (0–4) and `pos_y` the row (0–1) **inside the zone**. Labels are the zone in capitals plus a number, left to right, top row first:

```
        pos_x: 0        1        2        3        4
pos_y 0     DKB-01   DKB-02   DKB-03   DKB-04   DKB-05
pos_y 1     DKB-06   DKB-07   DKB-08   DKB-09   DKB-10
```

The same for `DEKA-01`…`DEKA-10`, `VV-…`, `DBIS-…` and `UNION-01`…`UNION-10`.

**Seed reservations** (the next two weekdays, skipped if they'd clash with a real booking): day 1 Sofia DKB-03, João DKB-04, Tiago DEKA-01, Pedro VV-05, Inês UNION-02, Laura DBIS-07. Day 2 Marta DKB-03, Miguel DEKA-06, Beatriz UNION-02.

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
- Concurrency tests (two sessions racing) can't use `db`: see `tests/test_approvals_concurrency.py`, which commits real rows through the session-scoped `engine` and deletes them afterwards.
- Tests that depend on "now" freeze the clock with `time_machine.travel(...)` (see `tests/test_my_enrollments.py`). Services must take "now" from `datetime.now(UTC)`, never from MySQL's `NOW()`, so the frozen clock applies.
- Create users with `make_user(name=..., is_admin=True, team_lead=lead, ...)` (every field has a default) and call the API as them with `client.get(url, headers=auth_headers(user))`.
- The test database is created by `docker-compose.yml` only when the volume is **new**. With an older volume, either reset it (`docker compose down -v && docker compose up -d`) or run once: `docker exec -i praying-mantis-mysql mysql -uroot -proot -e "CREATE DATABASE IF NOT EXISTS praying_mantis_test; GRANT ALL ON praying_mantis_test.* TO 'app'@'%';"`
Allowed frontend origins are set by `CORS_ORIGINS` (comma-separated).

### Production image (Docker)

Run from `backend/`:

```sh
docker build -t praying-mantis-backend .
docker run --rm -p 8000:8000 --network praying-mantis-1_default \
  -e DB_HOST=praying-mantis-mysql -e DB_USER=app -e DB_PASSWORD=app -e DB_NAME=praying_mantis \
  -e JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(48))") \
  praying-mantis-backend
```

Settings come only from environment variables (the image has no `.env`). On a host, set them in its secret store. For Render, `render.yaml` (repo root) declares the service and every variable; secrets are marked `sync: false` and entered in Render's dashboard.

| Variable | Required | Notes |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | yes | from the database host's dashboard |
| `DB_SSL_CA` | for a remote DB | the DB server's CA certificate (PEM text), so TLS also verifies the server |
| `JWT_SECRET` | yes | at least 32 characters, different from any local one |
| `CORS_ORIGINS` | yes | the frontend's origin, e.g. `https://cofinpro.github.io` (no path) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `APP_URL` | no | email for approval requests. Unset `SMTP_HOST` = no email. `APP_URL` is the frontend's base URL, for links. |
| `OFFICE_TIMEZONE`, `BOOKING_DAYS_AHEAD` | no | seat booking rules (defaults `Europe/Lisbon`, `14`) |
| `REMINDERS_EVERY_MINUTES` | no | how often the reminder loop runs (default `15`, `0` = off) |
| `SEED_ON_START` | no | `true` runs the demo seed on every start (demo only) |
| `PORT` | no | set by the host; defaults to 8000 |

### Frontend

```sh
cd frontend
pnpm install
pnpm dev       # http://localhost:5173, against the real backend at VITE_API_URL
pnpm dev:mock  # same, but MSW answers every API call (no backend needed)
pnpm build     # tsc -b && vite build
pnpm lint      # oxlint
pnpm test      # Vitest, once (MSW answers every API call, no backend needed)
pnpm test:watch  # Vitest in watch mode
pnpm gen:api   # regenerate src/api/schema.d.ts from http://localhost:8000/openapi.json (backend running)
```

- Copy `frontend/.env.example` to `frontend/.env.local` (git-ignored) to change `VITE_API_URL` or `VITE_USE_MOCKS`.
- Run `pnpm gen:api` after every backend schema change and commit `schema.d.ts`, so the build never needs a running backend.

## Deployment

GitHub Pages hosts only the static frontend.

**Backend:** https://praying-mantis-api.onrender.com (API docs at `/docs`, check `/api/health/db`)
- Render free web service built from `backend/Dockerfile`, set up by `render.yaml`. It redeploys when a push to `main` touches `backend/` and the GitHub checks pass.
- Database: Aiven free MySQL 8 over verified TLS. Secrets (DB host/port/password, CA, JWT secret) live in Render's **Environment** settings, never in git.
- Demo data only: `SEED_ON_START=true` re-runs the seed on every start, so seed logins work there too.
- **Cold start:** after 15 minutes without requests the service sleeps, and the next request takes about a minute.
- Logs and redeploys: Render dashboard → `praying-mantis-api` → **Logs** / **Manual Deploy**.

**Frontend:** https://cofinpro.github.io/praying-mantis-1/ talks to the Render backend (FE-7.1).
- The Pages build uses `--base=/<repo-name>/`. `deploy-pages.yml` defaults to `VITE_API_URL=https://praying-mantis-api.onrender.com` and `VITE_USE_MOCKS=false`. The repo variables of the same names (Settings → Secrets and variables → Actions → Variables) override them, e.g. `VITE_USE_MOCKS=true` for a mock-only demo.
- The backend's `CORS_ORIGINS` must include `https://cofinpro.github.io`, and it does.
- After a cold start, the first request (usually the login) can take about a minute.

## Conventions

- Use pnpm for the frontend, never npm or yarn.
- **API:**
  - REST + JSON, all routes under `/api` (routers are included with `prefix="/api"` in `main.py`)
  - Errors use FastAPI's `{"detail": ...}`. Business-rule conflicts return 409 with `{"detail": {"code": "...", "message": "..."}}`.
  - Datetimes are ISO 8601 in UTC (`...Z`), and dates are `YYYY-MM-DD`
- **Backend:**
  - DB access goes through the `get_db` dependency (`db: DbSession`)
  - An endpoint that needs a logged-in user takes `user: CurrentUser` (from `app/dependencies.py`). That's all it takes: missing, invalid or expired tokens get a 401 before the endpoint runs.
  - An admin-only endpoint takes `admin: AdminUser` instead: no token → 401, not an admin → 403 `{"detail": "Admins only"}`. Rules like "only your own reports" are checked in `services/` and also return 403.
  - Business rules live in `services/`, not in routers
  - Pydantic schemas (`schemas/`) are the API contract; SQLAlchemy models (`models/`) are the database shape
  - Every schema change needs an Alembic migration (no `create_all`)
  - Enums are stored as VARCHAR (`Enum(..., native_enum=False)`)
  - Datetime columns use `UtcDateTime` (`app/models/types.py`). API inputs use `AwareDatetime`, so a time without `Z` or an offset is a 422.
  - Services raise `NotFound("...")` / `Forbidden("...")` for 404 / 403.
  - Business-rule failures in services: `raise Conflict("snake_case_code", "Message for people")` → 409 `{"detail": {"code", "message"}}`. Validation that needs the DB: `raise ValidationFailed(field, message, type)` → 422 in Pydantic's shape. Routers don't catch either.
  - `PATCH` bodies have every field optional and are applied with `model_dump(exclude_unset=True)`: a missing field is kept, `null` clears it (only for nullable fields)
  - Values derived per row (`seats_left`, `my_enrollment_status`) are computed in the SQL `SELECT`, never in a Python loop. Load related objects in the same query (`joinedload` / `selectin`), and guard list endpoints with a query-count test (see `tests/test_trainings_read.py`).
  - "Not found" and "not allowed to see it" return the same 404, so IDs don't reveal what exists
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
  - Tests only cover real features, i.e. behaviour a story's acceptance criteria ask for. No tests for placeholders, temporary code or made-up cases
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
