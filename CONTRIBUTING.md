# Contributing to TruthLens

Thanks for your interest in contributing. TruthLens is a deterministic YouTube
creator-credibility analyzer. This guide keeps contributions focused and mergeable.

## Ground rules

- **Every control must do real work.** No dead buttons, fake counters, or
  `console.log` actions. Each visible control calls real logic and shows truthful
  loading, success, empty, and failure states.
- **The engine stays deterministic.** Scores must be reproducible from the same
  public metadata. If you change scoring, update the unit tests in
  `tests/engine.test.ts` and bump `ENGINE_VERSION`.
- **The audit chain must stay intact.** Every create, update, and delete appends
  a sealed event. Never mutate or delete `audit_events` rows directly.
- **No secrets.** Never commit `.env` files, connection strings, or API keys.

## Setup

```bash
npm install
npm run dev
```

Local development needs **zero environment variables** — TruthLens uses an
embedded in-memory Postgres (PGlite) when `DATABASE_URL` is unset. Production
requires `DATABASE_URL` (see `.env.example`).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit + integration tests (Vitest) |
| `npm run smoke` | Browser smoke tests (Playwright) |
| `npm run verify:live` | Verify the live deployment end to end |

## Pull requests

1. Fork and create a feature branch.
2. Add or update tests for any behavior change.
3. Make sure `npm run typecheck`, `npm run lint`, `npm test`, and
   `npm run build` all pass.
4. Keep PRs focused — one concern per PR.
5. Describe the user-visible outcome in the PR body.

## Reporting issues

Use the issue templates. For bugs, include the channel URL, what you expected,
and what happened. For security reports, see `SECURITY.md`.
