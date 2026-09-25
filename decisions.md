# Decisions

A log of architectural and tooling decisions. Newest first.

Template:

```
## YYYY-MM-DD — Title
**Context:** why a decision was needed
**Decision:** what was chosen
**Consequences:** trade-offs, follow-ups
```

---

## 2026-09-25 — Frontend: React + TypeScript on Vite, with pnpm
**Context:** The frontend needed a base project.
**Decision:** Made the project with `create-vite` using the `react-ts` template and pnpm as the package manager. Stripped the template down to a single Hello World component.
**Consequences:** Linting uses oxlint (the template default) instead of ESLint. Contributors need pnpm installed.

## 2026-09-25 — Backend: FastAPI + SQLAlchemy + MySQL
**Context:** The backend needed an API framework and a database.
**Decision:** FastAPI for the API and SQLAlchemy 2.x (`DeclarativeBase`) with PyMySQL for MySQL. Config is loaded from `backend/.env` through python-dotenv.
**Consequences:** Running locally needs a MySQL instance. `/health/db` checks the connection.
