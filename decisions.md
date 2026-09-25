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

## 2026-09-25 — Withdrawing, and one state machine for every status change
**Status:** Accepted
**Context:** BE-3.3 implements `POST /api/enrollments/{id}/withdraw`. Approve, reject and withdraw each change an enrollment's status.
**Decision:**
- **One table decides every move** (`ALLOWED_MOVES` + `check_move` in `services/enrollments.py`): pending → approved | rejected | withdrawn, approved → withdrawn, nothing out of rejected or withdrawn. A test checks all 16 combinations against the agreed diagram.
- **Withdraw rules:**
  - only the **owner**: 403 for anyone else, including their team lead and admins
  - only from **pending or approved**: 409 `not_withdrawable`
  - only **before `starts_at`**: 409 `training_started`
  - it works on a cancelled training too (harmless)
- Withdrawing an approved enrollment frees its seat. `decided_by` / `decided_at` stay as the record of the earlier approval.
- Requesting again after a withdrawal is `request()`'s job (the same row goes back to pending), not a state-machine move.
- Withdraw locks the training row, then the enrollment row, like approve, so a withdrawal and an approval of the same request can't interleave.
**Consequences:** Notifying the team lead is a `TODO(BE-4.1)` in `withdraw`.

## 2026-09-25 — Approvals: who decides, and how the last seat is protected
**Status:** Accepted
**Context:** BE-3.2 implements `GET /api/approvals` and approve/reject per the F3 contract, with Q6 answered by the defaults.
**Decision:**
- **Who decides** (`can_decide` / `_decidable_by` in `services/enrollments.py`): the requester's team lead. **Admins decide only for users without a team lead** (Q6), not as an override for everyone. Nobody decides their own request. The list and the approve/reject permission use the same rule, so what you see is exactly what you may decide.
- **The approvals list** holds only pending requests for upcoming, uncancelled trainings, oldest first. Anyone logged in may call it, and employees get `[]`.
- **Approve** runs in one transaction:
  1. lock the training row (`SELECT … FOR UPDATE`), then the enrollment row, in that order everywhere
  2. check it's still pending and the training hasn't started or been cancelled
  3. count approved enrollments with a **locking read** (`… FOR SHARE`), which is needed under MySQL's REPEATABLE READ. `tests/test_approvals_concurrency.py` proves it: with a plain `COUNT`, two leads both approved a 1-seat training.
- **409 codes:** `not_pending`, `training_full`, `training_started`, `training_cancelled`. **403** for someone else's report. Approve and reject both take an optional `{comment}` (max 500).
- Reject doesn't check capacity. A rejected user can't ask again (Q8).
**Consequences:** An admin can't approve on behalf of an absent team lead. If that's needed, it's a separate rule to add. Notifying the requester is a `TODO(BE-4.1)`.

## 2026-09-25 — Requesting a seat: rules and error codes
**Status:** Accepted
**Context:** BE-3.1 implements `POST /api/trainings/{id}/enrollments` per the F3 contract, with Q7 and Q8 answered by the defaults.
**Decision:**
- Rules, checked in this order in `services/enrollments.request`:
  1. unknown training → 404
  2. not for your level → **403** (per the contract, unlike `GET /api/trainings/{id}`'s 404)
  3. cancelled → 409 `training_cancelled`
  4. already started → 409 `training_started`
  5. pending or approved → 409 `already_requested`
  6. rejected → 409 `request_rejected` (Q8)
  7. full → 409 `training_full`
- **Full** = approved enrollments ≥ `max_seats`. Pending requests don't take a seat (Q7), so more people can ask than there are seats. Approval re-checks capacity (BE-3.2).
- **Withdrawn users may request again**: the same row goes back to `pending`, and its decision fields are cleared, because UNIQUE (`training_id`, `user_id`) allows one row per person and training.
- The level rule applies to admins too. They see every training, but they only *join* their own level's.
- Two identical requests at the same moment: the UNIQUE constraint makes one fail, and it becomes `already_requested`.
- `seats_left` and `my_enrollment_status` are now correlated subqueries in the list/detail query, still one query.
**Consequences:** FE maps the five 409 codes to messages. Notifying the team lead is a `TODO(BE-4.1)` in `request`.

## 2026-09-25 — Editing and cancelling trainings
**Status:** Accepted
**Context:** BE-2.3 implements `PATCH /api/trainings/{id}` and `POST /api/trainings/{id}/cancel` per the F2 contract. Several details were open.
**Decision:**
- **PATCH** applies only the fields that were sent. A missing field is kept; `null` clears `trainer_id` / `external_trainer_name` (= External) and is a 422 for fields that can't be empty.
- **Cross-field rules are checked on the result**: sending only `ends_at` is compared with the stored `starts_at`. Switching to an external trainer means sending both `"trainer_id": null` and the name, so nothing changes silently.
- `starts_at`, when sent, must still be in the future. Past trainings can otherwise still be edited (e.g. fixing a typo).
- **409 codes**: `training_cancelled` (edit or cancel a cancelled training), `training_started` (cancel one that already started, which would erase people's completed training), `max_seats_below_approved`.
- **Cancel is a soft delete**: `cancelled_at` is set and the row stays, so enrollments and history keep pointing at it. There's no un-cancel.
- The edit and cancel lock the training row (`SELECT … FOR UPDATE`) so they can't interleave with an approval (BE-3.2 locks the same row). `count_approved` is 0 until BE-3.1.
- Services raise `Conflict` / `ValidationFailed` (`app/errors.py`); handlers in `main.py` turn them into 409 / 422.
**Consequences:** FE's edit form can send the whole form or only changes; both work. Notifying enrolled people on cancel is a `TODO(BE-4.1)` in `cancel_training`.

## 2026-09-25 — Training detail: cached card as placeholder, and an action panel for F3
**Status:** Accepted
**Context:** FE-2.3 builds `/trainings/:id` on `GET /api/trainings/{id}`.
**Decision:**
- The page shows the card's facts (date and time, trainer, levels, seats, status) and the description, which keeps its line breaks (`white-space: pre-line`, no Markdown).
- While the detail loads, the summary from any cached training list is shown through `placeholderData`, with "Loading description…" in place of the text.
- A 404, or an id that isn't a positive integer, shows `NotFoundPage` with "Training not found". The API gives the same 404 for "doesn't exist" and "not for your level", so the message covers both.
- A cancelled training shows a banner and no join area.
- The right-hand panel ("Your place") holds the seats, the status badge and, for now, "Requests to join open soon." F3 (FE-3.1 / FE-3.3) puts the Request to join and Withdraw buttons there.
- Figma's detail screens (`03 Training detail`, `03b`–`03e`) couldn't be fetched (the Figma API was rate-limited), so the layout follows the spec's description. Compare it with Figma when you next look.

**Consequences:** F3 only has to fill the panel. The rest of the page is derived from the query, so it updates after a refetch.

## 2026-09-25 — Training list: TanStack Query, cards, and the admin filter in the URL
**Status:** Accepted
**Context:** FE-2.2 shows `/trainings` as cards and introduces TanStack Query (D7).
**Decision:**
- **One `QueryClient`** (`api/queryClient.ts`), which retries only network errors and 5xx, once. The query keys live there too (`queryKeys.me`, `queryKeys.trainingList(level)`).
- **`/me` moved to `useQuery`** (`enabled` only with a token, `staleTime: Infinity`). `login()` loads it with `fetchQuery` before resolving. `logout()` (and any 401) clears the token and the **whole cache**.
- **Creating a training** invalidates every `['trainings']` query.
- **Cards** follow Figma `TrainingCard`. The name is the only link, stretched over the card with `::after`, so the whole card is clickable but a screen reader hears one link. Cancelled trainings (visible to admins only) get a strikethrough name and a "Cancelled" badge. Otherwise the badge shows `my_enrollment_status`.
- **Admins** see a "Level" select, stored in the URL as `?level=`, and a subtitle saying the list includes past and cancelled trainings. **Employees** see their own level as a tag next to "Upcoming trainings for your level".
- The MSW list uses mock trainings with dates relative to today (`mocks/data/trainings.ts`) and the same visibility rules as the backend.

**Consequences:** Everything that reads server data from now on should use `useQuery` / `useMutation` with a key from `queryKeys`, not `useEffect`.

## 2026-09-25 — Create-training form: a Trainer combobox, validation in a plain module
**Status:** Accepted
**Context:** FE-2.1 builds `/admin/trainings/new` against `POST /api/trainings` (BE-2.1).
**Decision:**
- **Trainer** is a searchable combobox (`TrainerPicker`): "External" is always the first option, then users from `GET /api/users?search=`, debounced by 300 ms. This keeps Figma's single "Trainer" select and meets the "searchable user picker **or** External" criterion. "External trainer name (optional)" is only enabled when External is picked.
- **Validation and mapping** live in `src/trainings/trainingForm.ts`: `validateTrainingForm()` mirrors the backend's `TrainingCreate` rules, `toTrainingCreate()` builds the body (local → UTC), and `serverErrorsToFields()` puts a 422's errors on fields. Errors show under each field and in one alert ("Please fix N fields · …") as in Figma `04b`.
- The form uses `noValidate`, so only our messages show, not the browser's pop-ups.
- New shared pieces: `TextArea`, `CheckboxGroup` (generic over the option type), `BackLink`, and a `ghost` variant of `Button` / `ButtonLink`.
- The MSW `POST /api/trainings` trusts its body (the form validates first) and keeps created trainings in memory. `GET /api/users` searches the seed users.
- Frontend tests run with `TZ=Europe/Lisbon` (set in `vite.config.ts`).

**Consequences:** When the backend's rules change, `validateTrainingForm()` must follow. The backend still has the final say, and its 422s are shown too.

## 2026-09-25 — Backend hosting: Render (free) + Aiven MySQL (free)
**Status:** Proposed by BE, to confirm in SCRUM-55 (F7, together) and, for real employee data, with the company (Q13).
**Context:** The backend and database need a host. Constraints: no cost, and as little setup and upkeep as possible.
**Decision:**
- **Backend:** a Render free web service built from `backend/Dockerfile`. Render redeploys on every push to `main`, and its dashboard stores the secrets.
- **Database:** Aiven's free MySQL 8 (1 CPU, 1 GB RAM, 1 GB storage, no card). It's real MySQL, so migrations, CHECK constraints and the collation behave as they do locally. Connections use TLS and verify Aiven's CA (`DB_SSL_CA`).
- **Migrations run on start** (`start.sh`), because Render's pre-deploy command isn't available on the free plan. With one instance, "on start" = "on deploy".
- **Demo data:** `SEED_ON_START=true`, because the free plan has no shell to run the seed by hand.
**Consequences:**
- **Cold starts:** Render's free services sleep after 15 minutes idle, and the next request takes about a minute. FE should show a "waking up" state (FE-7.1).
- Aiven powers off a free database after a long inactivity (with an email warning first); it's turned back on from their dashboard.
- **Fake data only** until the company approves a host for employee data. The seed users are fictional.
- Both are outside company infrastructure; moving later means changing environment variables, not code.

## 2026-09-25 — Role-aware navigation: permission functions and a "Not allowed" page
**Status:** Accepted
**Context:** FE-1.2 hides navigation that doesn't apply to the user and blocks pages they can't use.
**Decision:**
- The rules are small functions in `src/auth/permissions.ts`: `isAdmin`, and `canApprove` (team lead **or** admin, from Q6). Nav links, buttons and route guards all use the same functions.
- Nav links take an optional `visibleTo` permission (`config/navigation.ts`), and TopBar filters by it.
- `<RequirePermission allow={...}>` shows `NotAllowedPage` in place of the page and keeps the URL, rather than redirecting away. `/approvals` uses `canApprove`, and every route under `/admin` uses `isAdmin` through one guard around an `<Outlet />`.
- "+ New training" is a `ButtonLink` in the `PageHeader`'s new `actions` slot, as in Figma's `02c Trainings – admin`.

**Consequences:** These checks only decide what the UI shows. The backend still returns 403 for anything a user isn't allowed to do.

## 2026-09-25 — Login on the frontend: AuthContext, a 401 listener, and a logout button
**Status:** Accepted
**Context:** FE-1.1 adds login, logout and protected pages on top of the JWT contract (see "Authentication").
**Decision:**
- `src/api/client.ts` owns the token (`authToken`, in localStorage) and adds `Authorization: Bearer` to every request. On a 401 it clears the token and calls the listener that `AuthProvider` registers with `onUnauthorized()`, which logs the user out. Calls made with `{ anonymous: true }` (only login) send no token, and a 401 there is just an error for the form.
- `AuthProvider` (`src/auth/`) holds the user from `GET /api/auth/me`. On startup it checks a stored token against `/me` before any protected page renders. `useAuth()` reads it. `<RequireAuth>` wraps the layout route and redirects to `/login`.
- After login the app always goes to `/trainings` (the acceptance criterion), not back to the page that sent you to `/login`.
- **Logout** is an icon button next to the user block in the TopBar. Figma has no logout control, and this keeps the bar's layout unchanged.
- Added three semantic tokens for the error states in Figma (`01b Login – error`, TextField `error`, Alert `error`): `--color-text-danger`, `--color-border-danger` (red/700) and `--color-bg-danger-subtle` (red/50). The Figma REST token can't read variable names, so these names are ours. Rename them if Figma calls them something else.
- The MSW handlers accept the seed logins from `src/mocks/data/users.ts` (a copy of `backend/app/seed.py`), so the live site on mocks can be logged into too.

**Consequences:** The token is still readable by any script on the page (see "Authentication"). When the seed users change, `src/mocks/data/users.ts` must be updated too.

## 2026-09-25 — Listing trainings: who sees what
**Status:** Accepted
**Context:** BE-2.2 implements `GET /api/trainings` and `GET /api/trainings/{id}` per the F2 contract.
**Decision:**
- **Employees' list:** upcoming (`starts_at` in the future), not cancelled, and one of the training's levels is theirs. Sorted by `starts_at`. The `?level=` filter is admin only, and for employees it's **ignored** (not a 403), so the FE can build the URL the same way for everyone.
- **Admins' list:** every training, including past and cancelled ones (they manage them), with an optional `?level=`.
- **Detail:** employees can open any training for their level, **including past and cancelled ones**, because the Profile page (F5) links to completed trainings. Other levels get a 404, the same response as a missing id, so employees can't probe which trainings exist.
- `seats_left` and `my_enrollment_status` are SQL columns of the list query. Until BE-3.1 adds enrollments they're placeholders (`max_seats` and `NULL`) in `services/trainings.py`, and BE-3.1 only replaces `seats_left_column()` and `my_enrollment_status_column()`.
**Consequences:** FE shows past and cancelled trainings only to admins in the list. A training that's cancelled after an employee enrolled still opens for them.

## 2026-09-25 — Trainings: UTC column type, trainer rules, and a delete guard
**Status:** Accepted
**Context:** BE-2.1 implements `POST /api/trainings` per the F2 contract in `plan.md`. A few details weren't spelled out there.
**Decision:**
- **Time zones:** a `UtcDateTime` column type stores naive UTC in MySQL and always returns timezone-aware UTC, so responses end in `Z`. The API rejects datetimes without `Z` or an offset (`AwareDatetime`) instead of guessing their zone. An offset like `+01:00` is accepted and converted.
- **"Trainer XOR external"** means *not both*: `trainer_id` set → no external name. `trainer_id` null → External, and the name is optional (Q1).
- **Unknown `trainer_id`** → 422 in Pydantic's error format (`type: "trainer_not_found"`, `loc: ["body", "trainer_id"]`), so FE shows it next to the field like any other validation error.
- **Deleting a user who is a trainer is blocked** (FK `RESTRICT`), instead of `SET NULL`, which would silently turn their trainings into "External".
- Levels are de-duplicated and returned in level order (junior → senior architect).
- `seats_left` = `max_seats` and `my_enrollment_status` = `null` until enrollments exist (BE-3.1).
**Consequences:** FE must send UTC (`toISOString()` does). The DB also has CHECK constraints for `max_seats > 0` and `ends_at > starts_at`.

## 2026-09-25 — Frontend tests: Vitest in jsdom, reusing the MSW handlers
**Status:** Accepted
**Context:** FE-0.3 sets up component tests and CI for `frontend/`.
**Decision:**
- Vitest is configured in `vite.config.ts`, with the `jsdom` environment and `src/test/setup.ts` as its setup file. `globals` stays off: tests import from `vitest`, and the setup file calls `cleanup()`.
- Tests use the same `src/mocks/handlers.ts` as the browser, through `msw/node` (`src/mocks/server.ts`). An API call without a handler fails the test (`onUnhandledRequest: 'error'`).
- `router.tsx` exports its `routes`, and `renderRoute(path)` in `src/test/render.tsx` mounts them in a memory router, so tests render real pages inside the real layout.
- Test files sit next to the code they test (`Layout.test.tsx`). They are in `src/`, so `pnpm build` type-checks them too.
- Tests only cover real features: behaviour that a story's acceptance criteria ask for. Placeholder pages and temporary code (like the `GET /api/` call on the Trainings page) get no tests.
- `.github/workflows/frontend-checks.yml` runs `pnpm lint`, `pnpm build` and `pnpm test` on every PR that touches `frontend/`.

**Consequences:** Tests need no backend. Endpoint-specific cases override a handler with `server.use(...)`.

## 2026-09-25 — Login details: HTTPBearer, and no email format check on login
**Status:** Accepted
**Context:** BE-1.2 implements the F1 auth contract from `plan.md` (JSON body `{email, password}` → `{access_token, token_type}`).
**Decision:**
- **`HTTPBearer`**, not `OAuth2PasswordBearer`, reads the token. Both read `Authorization: Bearer …`. But `OAuth2PasswordBearer` makes the `/docs` "Authorize" button post a *form* to the login URL, and our login takes JSON (per the contract), so it would fail. With `HTTPBearer`, you paste a token into "Authorize".
- **The login email is a plain string**, not Pydantic's `EmailStr`. `EmailStr` rejects reserved domains such as `.test`, so the seed users (`@preyingmantis.test`) couldn't log in. Login doesn't need a format check anyway: an email that matches no user gets the same 401. Endpoints that *create* users should still use `EmailStr`.
- Tokens: `sub` = user id, `iat`, `exp` (8 h), HS256 with `JWT_SECRET` (required, at least 32 characters). Decoding pins the algorithm and requires `sub` and `exp`.
- An unknown email still runs one Argon2 verification against a dummy hash, so response times don't reveal which emails exist.
**Consequences:** The contract is unchanged. `JWT_SECRET` must be set everywhere, including CI and, later, the deployment (BE-7.1).

## 2026-09-25 — PRs without reviews
**Status:** Accepted. Supersedes the review part of "Team split and a contract-first workflow" and D12 in `plan.md`.
**Context:** With everything built in one day, waiting for the other developer to review each PR slows both lanes down.
**Decision:** Every story still gets its own branch and PR, but only as a record of the change. Nobody is requested as a reviewer, and a PR doesn't need an approval to be merged.
**Consequences:** We lose cross-review as the main way to learn the other half of the stack, so the PR descriptions, `learnings.md` and the demo-and-reflect step carry more of that. Mistakes are caught later, at integration.

---

## 2026-09-25 — API client: a hand-written `fetch` wrapper, MSW in dev and on Pages
**Status:** Accepted
**Context:** FE-0.2 needs one place that talks to the API, mocks so the frontend doesn't wait for the backend, and types generated from `/openapi.json`.
**Decision:**
- **Client:** a small hand-written wrapper in `src/api/client.ts` (`api.get<T>(path)` and so on) around `fetch`, not `openapi-fetch` or axios. We write it once to learn how it works. It throws `ApiError` with `status`, FastAPI's `detail`, and `code` for 409 business-rule conflicts.
- **Endpoint functions:** one module per area (`src/api/health.ts`, later `trainings.ts`…) with a typed function per endpoint. Pages and hooks call those, never `api` or `fetch` directly, so TanStack Query can wrap them later.
- **Types:** `openapi-typescript` generates `src/api/schema.d.ts` (`pnpm gen:api`), and it is **committed**, so `pnpm build` and CI never need a running backend. Routes without a `response_model` generate `unknown`, so their types are hand-written next to the endpoint function until the backend adds one.
- **Mocks:** MSW, switched on by `VITE_USE_MOCKS=true`. `pnpm dev:mock` uses a Vite mode (`.env.mock`) to set it. Handlers match `*/api/...`, so they don't depend on `VITE_API_URL`. An API call without a handler logs an MSW error, and other requests (fonts, Vite modules) pass through silently.
- **GitHub Pages:** the deploy workflow builds with `VITE_USE_MOCKS=true` unless the repo variable says `false`, so the live site works before the backend is deployed (BE-7.1). The worker is registered from `BASE_URL`, so it works under `/<repo>/`.
**Consequences:** Every new endpoint needs three things: its function in `src/api/`, an MSW handler, and a `pnpm gen:api` run once BE has merged it. Without mocks, MSW is dead code that Vite drops from the bundle. The live site shows mock data until someone flips `VITE_USE_MOCKS`.

---

## 2026-09-25 — App shell: GitHub Pages deep links via 404.html, React Router data mode
**Status:** Accepted
**Context:** FE-0.1 needs client-side routes that survive a refresh on GitHub Pages. Pages is static hosting, so a refresh on `/praying-mantis-1/trainings` asks for a file that doesn't exist and gets a 404.
**Decision:**
- **Deep links:** clean URLs (`BrowserRouter` style), not `HashRouter`. `public/404.html` catches the unknown path, keeps the first segment (the repo name), moves the rest into the query string (`/praying-mantis-1/?/trainings/5`) and redirects. An inline script in `index.html` turns it back into the real URL with `history.replaceState` before React starts. `&` in the original query is escaped as `~and~` on the way.
- **Router:** React Router v8 in data mode: `createBrowserRouter` with a route array (closest to vue-router's `routes`), `RouterProvider` from `react-router/dom`, and `basename: import.meta.env.BASE_URL`, so the same code works under `/` locally and under `/<repo>/` on Pages.
- **Routes:** `/login` has no TopBar, so it sits outside the `Layout` route. `/` redirects to `/trainings`, and unknown paths show a NotFound page inside the Layout.
- **Profile:** not a nav item. The avatar and name in the TopBar link to `/profile`, as in Figma. This replaces the "Profile" nav link in FE-0.1's acceptance criteria.
- **External links:** Timesheets ↗ and Vacations ↗ are in the nav as in Figma, with `href: null` (rendered disabled, "coming soon") until the other teams give us URLs.
- **Tokens and font:** `src/styles/tokens.css` copies every Figma variable as a CSS custom property. Text styles are `font` shorthands (`--font-h1`). Inter is self-hosted through `@fontsource-variable/inter`.
- **Phone width:** below 1024px the nav moves into a panel opened by a menu button. Below 600px the user name is hidden visually (not from screen readers).
**Consequences:** Real 404s on Pages briefly load the app and then show our NotFound page, and search engines see a 404 status first, which doesn't matter for an internal tool. The first render of a deep link costs one extra redirect. `vite preview` doesn't use `404.html`, so testing the trick locally needs a server that serves `404.html` for unknown paths.

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

---

## 2026-09-25 — Visual design: PreyingMantis with Cofinpro theming and shared design tokens
**Status:** Accepted
**Context:** Nothing visual existed yet (the frontend used `system-ui`), and FE-0.1 needs a look and feel. We also want design and code to share one vocabulary.
**Decision:**
- The product is named **PreyingMantis**. The repo keeps its name.
- Cofinpro theming from cofinpro.pt: orange `#FD6202`, ink `#131313`, accents green `#60D391`, purple `#8242D8`, blue `#006CFF`, Inter, pill buttons, 16px card corners.
- Light mode only. Desktop mocks only (1440 wide); mobile is handled in code (FE-7.2).
- Tokens live as Figma variables with the same names as our CSS custom properties (`color/text/primary` ↔ `--color-text-primary`): a hidden `Primitives` collection and a semantic `Tokens` collection. Components use semantic tokens only.
- Brand orange fails AA on white (3.0:1), so text, links and primary buttons use `#C24A00` (4.9:1). `#FD6202` is for fills, the logo and large text.
- Enrollment status colours: pending = purple, approved = green, rejected = red, withdrawn and cancelled = grey.
- Seat "taken" is crimson (not orange-red, which would read as the brand), with a lock icon; "mine" is Cofinpro green with a check icon; other clients' seats are grey and hatched.
- Figma mocks every page: Login, Trainings list, Training detail, Create/edit training, Approvals, Seats, Profile, plus the notifications dropdown. Full spec: `docs/superpowers/specs/2026-09-25-figma-design-design.md`.
- Tooltips ("Taken by …") use two extra tokens: `color/bg/inverse` (neutral/900) and `color/text/inverse` (white).
- The Figma file is [PreyingMantis — Design](https://www.figma.com/design/FFlbgdessRR1pHvP0MGpQh). The Starter plan allows only 3 pages, so the cover is a frame at the top of Foundations instead of its own page.
- Seats are 68 × 56 so the longest label (`UNION-10`) fits.
**Consequences:** FE-0.1 starts by copying the token values into a `tokens.css` of CSS custom properties. Figma is a reference, not a gate: when code diverges on purpose, update Figma. Dark mode would only need a second variable mode later.

---

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
- **Git:** one branch and PR per story, and the other developer reviews every PR. *(Review part superseded: see "PRs without reviews".)*
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
