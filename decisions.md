# Decisions

A log of architectural and tooling decisions. Newest first.

Template:

```
## YYYY-MM-DD — Title
**Status:** Accepted | Proposed | Superseded by …
**Context:** why a decision was needed
**Decision:** what was chosen
**Consequences:** trade-offs, follow-ups
```

---

## 2026-09-25 — Test isolation: one rolled-back transaction per test
**Status:** Accepted
**Context:** BE-0.3 asks whether each test should start clean through a transaction rollback or by truncating tables.
**Decision:**
- Each test runs in an outer transaction that is rolled back afterwards. The session uses `join_transaction_mode="create_savepoint"`, so `session.commit()` in app code turns into a SAVEPOINT and doesn't escape.
- The schema is built once per test run with `alembic upgrade head` on a freshly recreated `<DB_NAME>_test` database, so the migrations are tested too.
- No SQLite: it behaves differently from MySQL (enums, constraints, locking, `SELECT … FOR UPDATE`).
**Consequences:**
- Fast (no DDL or deletes between tests) and needs no list of tables to truncate.
- Only works when everything in a test goes through the **same connection**. Tests that need real concurrency (two sessions racing, e.g. the approval row lock in BE-3.2) must use their own connections and clean up by truncating. Add a separate fixture for those when we get there.
- MySQL DDL commits implicitly, so tests must not create or alter tables.

## 2026-09-25 — Defaults for the open questions in plan.md
**Status:** Accepted as defaults. Change any of them by adding a new entry.
**Context:** `plan.md` §8 lists 17 open questions. Work can't wait for all the answers, so we use the defaults until someone decides otherwise.
**Decision:**
- **Q1:** External trainers have an optional name. The UI shows "External" or "External – name".
- **Q2:** `isTeamLead` is derived, not stored.
- **Q3:** One seat per person per day. Picking another seat moves the reservation.
- **Q4:** Email + password login, no SSO (see the auth entry).
- **Q5:** Styling uses CSS Modules.
- **Q6:** Admins can approve enrollments. Users without a team lead are approved by an admin.
- **Q7:** Only approved enrollments take a seat. Approval re-checks capacity.
- **Q8:** A rejected user can't request the same training again.
- **Q9:** Employees only see trainings for their own level. Admins see all.
- **Q10:** "Completed" = approved + the training ended + not cancelled. No attendance tracking.
- **Q11:** A fake office layout: one floor, about 10 seats per zone, on a grid.
- **Q12:** The seat map shows the name of whoever reserved a taken seat.
- **Q13:** Backend hosting will be decided at milestone M6 (it probably needs company approval).
- **Q14:** Seats can be booked up to 2 weeks ahead. No weekends, no past days.
- **Q15:** Users can't edit their own level or client. Only admins can.
- **Q16:** Level order: Junior → Expert → Senior → Architect → Senior Architect.
- **Q17:** Use MSW mocks and generated TypeScript types (see the entry below).

**Consequences:** Q11 and Q13 almost certainly need real answers from the company before M4 and M6.

## 2026-09-25 — Concurrency: row lock for approvals, unique constraint for seats
**Status:** Accepted
**Context:** Two team leads can approve the last training seat at the same moment. Two employees can click the same office seat at the same moment.
**Decision:**
- **Approvals (pessimistic):** lock the training row with `SELECT … FOR UPDATE`, recount the approved enrollments, then approve. All in one transaction.
- **Seats (optimistic):** rely on UNIQUE (`seat_id`, `date`). Insert, catch `IntegrityError`, and return 409 `seat_taken`.
**Consequences:** We get to see both approaches in practice and compare them in `learnings.md`. The UI must handle "someone else was faster" messages.

## 2026-09-25 — Notifications: stored in the DB, polled by the frontend
**Status:** Accepted
**Context:** Team leads and employees need to hear about requests, decisions, cancellations and withdrawals.
**Decision:** A `notifications` table, written in the same transaction as the action that causes it. The frontend polls every 30 s (TanStack Query `refetchInterval`). Email is a stretch goal, sent through FastAPI `BackgroundTasks` to Mailpit locally.
**Consequences:** It can take up to 30 s before a notification appears, which is fine for this use. Server-Sent Events or WebSockets could be a later learning spike.

## 2026-09-25 — Data model refined from the first sketch
**Status:** Accepted
**Context:** The first sketch couldn't store several things the workflows need: approval status, training levels, admin rights, map positions, and notifications.
**Decision:** Adopt the schema in `plan.md` §4.3 (summarized in `CLAUDE.md`). The main changes:
- an `enrollments` table with a status, instead of a "list of enrolled users"
- a `training_levels` join table
- `role` renamed to `level`
- `is_admin` added
- `trainer_id` nullable, where NULL means External
- `isTeamLead` derived instead of stored
- one shared `Client` enum for user clients and seat zones
- `starts_at` and `ends_at` stored in UTC
- `label`, `pos_x` and `pos_y` added to seats
- unique constraints on reservations
- a `notifications` table
- `password_hash` added
- snake_case, plural table names

**Consequences:** More tables than the sketch, but every rule in the workflow has a place in the database. Enums are stored as VARCHAR so they can change without painful migrations.

## 2026-09-25 — Mock the API in the frontend with MSW and generate TypeScript types from OpenAPI
**Status:** Accepted
**Context:** One developer does the whole frontend and the other the whole backend. The FE dev shouldn't have to wait for endpoints to exist, and the two sides must not drift apart.
**Decision:**
- **Mocks:** MSW (Mock Service Worker) answers API calls with contract-shaped data when `VITE_USE_MOCKS=true`.
- **Types:** TypeScript types are generated from FastAPI's `/openapi.json` with `openapi-typescript` (`pnpm gen:api`).
**Consequences:** Some setup in F0 (FE-0.2). After that the FE dev works independently, and FE code stays the same with mocks or the real API. The BE Pydantic schemas become the single source of truth. The GitHub Pages site can run on mocks until the backend is deployed.

## 2026-09-25 — Team split and a contract-first workflow
**Status:** Accepted
**Context:** Two developers. One does backend and database, the other frontend. Both want to learn.
**Decision:**
- **Contract first:** each feature starts with a joint session (Jira label `together`) to agree the screens and the API contract. Then BE (`backend`) and FE (`frontend`) stories run in parallel.
- **Git:** one branch and PR per story, and the other developer reviews every PR.
- **Swap stories:** a few small stories are marked 🔁 swap candidate, for building on the other side.
**Consequences:** Cross-review is the main way each person learns the other half of the stack. Contract changes after the joint session must be agreed by both.

## 2026-09-25 — API conventions
**Status:** Accepted
**Context:** Both sides need the same expectations about URLs, errors and dates.
**Decision:**
- **Style:** REST + JSON, with every route under `/api`.
- **Errors:** FastAPI's `{"detail": ...}`, and 422 for validation errors. Business-rule conflicts return 409 with `{"detail": {"code", "message"}}`.
- **Auth errors:** 401 when unauthenticated, 403 when forbidden.
- **Dates:** datetimes in ISO 8601 UTC (`Z`), and plain dates as `YYYY-MM-DD`.

**Consequences:** The existing `/` and `/health/db` move under `/api` in BE-0.2. The FE maps error `code`s to friendly messages.

## 2026-09-25 — Authentication: email + password with JWT in localStorage
**Status:** Accepted
**Context:** The platform needs to know who the user is, and whether they're an admin or a team lead. Company SSO is realistic, but it's mostly configuration and teaches little.
**Decision:**
- **Login:** our own login with passwords hashed through `pwdlib[argon2]`, and JWT access tokens (8 h, no refresh tokens) via `PyJWT`.
- **Token storage:** the frontend keeps the token in localStorage and sends it as `Authorization: Bearer`.
- **Error message:** one generic "Invalid email or password" for both a wrong email and a wrong password.

**Consequences:** localStorage is exposed to XSS. Revisit it (e.g. httpOnly cookies) when the backend is deployed in BE-7.1. SSO could replace the login later.

## 2026-09-25 — Backend tooling: Docker MySQL, Alembic, sync SQLAlchemy, pytest
**Status:** Accepted
**Context:** The backend needs a reproducible database, schema changes over time, and tests.
**Decision:**
- **Database:** MySQL 8 through Docker Compose.
- **Migrations:** Alembic, with pydantic-settings for config.
- **ORM:** SQLAlchemy stays synchronous.
- **Tests:** pytest with FastAPI `TestClient` against a real MySQL test database. No SQLite, because it behaves differently.

**Consequences:** Both developers need Docker. Every schema change needs a migration. CI needs a MySQL service container.

## 2026-09-25 — Frontend tooling: React Router, TanStack Query, CSS Modules, Vitest
**Status:** Accepted
**Context:** The frontend needs routing, server data, styling, forms and tests.
**Decision:**
- **Routing:** React Router.
- **Server data:** plain `fetch` first (FE-1.1) to learn the basics, then TanStack Query from FE-2.2.
- **Styling:** CSS Modules.
- **Forms:** controlled components (React Hook Form only if they get painful).
- **Tests:** Vitest + React Testing Library.

**Consequences:** GitHub Pages can't serve client-side routes, so FE-0.1 must pick either the `404.html` redirect or `HashRouter`, and record the choice here.

## 2026-09-25 — Deploy the frontend to GitHub Pages with Actions
**Status:** Accepted
**Context:** Every push to `main` should produce an up-to-date version that can be viewed online.
**Decision:** A GitHub Actions workflow builds `frontend/` with pnpm and deploys `dist/` to Pages. The backend URL is injected at build time from the `VITE_API_URL` repo variable.
**Consequences:** Pages is static hosting, so the FastAPI backend and MySQL aren't deployed. Until the backend is hosted somewhere, the live site shows "Backend unreachable". Pages must be enabled with source "GitHub Actions" in the repo settings.

## 2026-09-25 — Frontend talks to the backend directly, with CORS
**Status:** Accepted
**Context:** The frontend needed a simple connection to the backend.
**Decision:** `App.tsx` fetches `GET /` from `VITE_API_URL` and shows the message. The backend enables `CORSMiddleware` for the origins in `CORS_ORIGINS`.
**Consequences:** No dev proxy, so local dev and the deployed site work the same way. Every new frontend origin must be added to `CORS_ORIGINS`.

## 2026-09-25 — Frontend: React + TypeScript on Vite, with pnpm
**Status:** Accepted
**Context:** The frontend needed a base project.
**Decision:** Made the project with `create-vite` using the `react-ts` template and pnpm as the package manager. Stripped the template down to a single Hello World component.
**Consequences:** Linting uses oxlint (the template default) instead of ESLint. Contributors need pnpm installed.

## 2026-09-25 — Backend: FastAPI + SQLAlchemy + MySQL
**Status:** Accepted
**Context:** The backend needed an API framework and a database.
**Decision:** FastAPI for the API and SQLAlchemy 2.x (`DeclarativeBase`) with PyMySQL for MySQL. Config is loaded from `backend/.env` through python-dotenv.
**Consequences:** Running locally needs a MySQL instance. `/health/db` checks the connection.
