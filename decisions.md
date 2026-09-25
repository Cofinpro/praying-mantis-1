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

## 2026-09-25 — Deploy the frontend to GitHub Pages with Actions
**Context:** Every push to `main` should produce an up-to-date version that can be viewed online.
**Decision:** A GitHub Actions workflow builds `frontend/` with pnpm and deploys `dist/` to Pages. The backend URL is injected at build time from the `VITE_API_URL` repo variable.
**Consequences:** Pages is static hosting, so the FastAPI backend and MySQL aren't deployed. Until the backend is hosted somewhere, the live site shows "Backend unreachable". Pages must be enabled with source "GitHub Actions" in the repo settings.

## 2026-09-25 — Frontend talks to the backend directly, with CORS
**Context:** The frontend needed a simple connection to the backend.
**Decision:** `App.tsx` fetches `GET /` from `VITE_API_URL` and shows the message. The backend enables `CORSMiddleware` for the origins in `CORS_ORIGINS`.
**Consequences:** No dev proxy, so local dev and the deployed site work the same way. Every new frontend origin must be added to `CORS_ORIGINS`.

## 2026-09-25 — Frontend: React + TypeScript on Vite, with pnpm
**Context:** The frontend needed a base project.
**Decision:** Made the project with `create-vite` using the `react-ts` template and pnpm as the package manager. Stripped the template down to a single Hello World component.
**Consequences:** Linting uses oxlint (the template default) instead of ESLint. Contributors need pnpm installed.

## 2026-09-25 — Backend: FastAPI + SQLAlchemy + MySQL
**Context:** The backend needed an API framework and a database.
**Decision:** FastAPI for the API and SQLAlchemy 2.x (`DeclarativeBase`) with PyMySQL for MySQL. Config is loaded from `backend/.env` through python-dotenv.
**Consequences:** Running locally needs a MySQL instance. `/health/db` checks the connection.
