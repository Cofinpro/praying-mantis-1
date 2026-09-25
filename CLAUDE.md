# praying-mantis-1

Coding dojo project: a FastAPI backend and a React frontend.

## Project explanation

We are trying to build a internal platform for a company where we can do several different actions, these actions are:

* Book trainings
* Reserve seats in the office
* Fill your timesheets (Done by another group in another tech stack so doesnt matter)
* Schedule vacations (Also done by the other group so we dont care)
* Fill expense sheet (For now we dont do it)


Our tech stack is divided into frontend and backend technologies, for the backend we decided to use:

* Python
* FastAPI
* MySQL

For the frontend we decided to roll with react and pnpm.


The basis of this project is to improve already existing systems and to combine them all into a single platform.

## Database

For this project we have already sketched a database model.

For booking trainings are that we have a user table with name, email, client(same enum as zone in the seats id), role (enum with Junior, Expert, Senior, Architect, senior architect), isTeamLead (Boolean), TeamLead (which refers to another user that is this users teamlead). Then we have a trainings table with name, id, description, dateTime, maxSeats, Trainer (A user, or External, in which case it should just show external) and a list of enrolled users.

For reserving seats in the office we thought about having the table for users, a table called Seats with a id, and zone (which can be: DKB, Deka, VV, DBIS and UNION) and a ReservedSeat table which has a user, a seat and a date

We know that this might not be the best structure so if you find any possible improvements be sure to tell us.

## Feature workflow

##### Bookings trainings:

FIrst, a priviliged account can create trainings with the name, the description, the date, the trainer, and the skill level for the training (or multiple)

After that, the users with that skill level can go onto the trainings tab of our website, and see all trainings for their skill level, open them, read the description, and make a request to join. Whenever a user enrolls, his teamlead receives a notification (and maybe an email) telling him that he has to approve the enrollment of his training, after which the user receives a confirmation notification (and maybe also an email) telling him that he is now enrolled

The user can also see all his completed training in his profile tab

##### Reserving seats 

The user logs onto the page, and finds a reserve your seat tab, where he can see a map of the available seats, click on the ones that are of his client and reserve them for a day which he can choose. if the seat is already taken it appears as red, if not its just white.

## Layout

- `backend/` — FastAPI + SQLAlchemy on MySQL (via PyMySQL)
  - `app/main.py` — app and routes (`/`, `/health/db`)
  - `app/database.py` — engine, `SessionLocal`, `Base`, `get_db` dependency
  - `.env.example` — DB settings; copy to `backend/.env` (git-ignored)
- `frontend/` — React 19 + TypeScript on Vite, managed with **pnpm**
  - `src/App.tsx` calls the backend at `VITE_API_URL` (default `http://localhost:8000`)
- `.github/workflows/deploy-pages.yml` — builds `frontend/` and deploys it to GitHub Pages on every push to `main`

## Commands

### Backend

```sh
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in DB credentials
fastapi dev app/main.py   # http://localhost:8000
```

Allowed frontend origins are set by `CORS_ORIGINS` (comma-separated).

### Frontend

```sh
cd frontend
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # tsc -b && vite build
pnpm lint     # oxlint
```

## Deployment

GitHub Pages hosts only the static frontend; the backend is not deployed anywhere.
The Pages build uses `--base=/<repo-name>/` and reads the backend URL from the
repo variable `VITE_API_URL` (Settings → Secrets and variables → Actions → Variables).

## Conventions

- Use pnpm for the frontend, never npm or yarn.
- DB access goes through the `get_db` dependency in `app/database.py`.
- Record architectural or tooling choices in `decisions.md`.
- Record useful things to learn in `learnings.md` as we are trying to learn some new tech.
