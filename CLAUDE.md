# praying-mantis-1

Coding dojo project: a FastAPI backend and a React frontend.

## Layout

- `backend/` — FastAPI + SQLAlchemy on MySQL (via PyMySQL)
  - `app/main.py` — app and routes (`/`, `/health/db`)
  - `app/database.py` — engine, `SessionLocal`, `Base`, `get_db` dependency
  - `.env.example` — DB settings; copy to `backend/.env` (git-ignored)
- `frontend/` — React 19 + TypeScript on Vite, managed with **pnpm**

## Commands

### Backend
```sh
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in DB credentials
fastapi dev app/main.py
```

### Frontend
```sh
cd frontend
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # tsc -b && vite build
pnpm lint     # oxlint
```

## Conventions

- Use pnpm for the frontend, never npm or yarn.
- DB access goes through the `get_db` dependency in `app/database.py`.
- Record architectural or tooling choices in `decisions.md`.
- Record gotchas and things learned along the way in `learnings.md`.
