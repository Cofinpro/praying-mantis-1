# Learnings

Gotchas, surprises, and useful things discovered while working on the project. Newest first.

---

## 2026-09-25 — Unset GitHub Actions variables become empty strings
`${{ vars.X }}` evaluates to `""` when the variable doesn't exist, so `import.meta.env.VITE_API_URL ?? fallback` never falls back. Use `||` for env fallbacks.

## 2026-09-25 — Corepack couldn't install pnpm 12
`corepack enable pnpm` on Node 23.11 failed with `Cannot find module .../corepack/v1/pnpm/12.6.0/bin/pnpm.cjs`. The Corepack bundled with that Node version doesn't understand how pnpm 12 is packaged. Installing it with `npm install -g pnpm` worked.
