# Security Policy

## Supported versions

Only the `main` branch and the live deployment receive security fixes.

## Reporting a vulnerability

Please **do not** open a public issue for security reports. Instead, report
privately via GitHub's private vulnerability reporting on the repository, or
contact the maintainer. Include:

- a description of the vulnerability and its impact;
- steps to reproduce or a proof of concept;
- any suggested remediation.

We aim to acknowledge reports within 72 hours.

## Scope and notes

- TruthLens scores are **deterministic heuristics computed from public YouTube
  metadata**. They are not fact-checks, do not prove intent, and must not be
  treated as definitive judgments about a person.
- The app uses anonymous session cookies (HTTP-only, SameSite=Lax) to scope
  reports. There are no accounts and no authentication.
- Anonymous write abuse is controlled by a best-effort in-memory rate limiter
  (per-instance; see `src/lib/rate-limit.ts`). For production abuse
  protection, place a hosted rate limiter or WAF in front of the app.
- External requests to YouTube are time-bounded and use public feeds only.
