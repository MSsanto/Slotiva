# ADR 001: Run the MVP entirely on Cloudflare

Status: accepted; implementation present in the repository.

## Context

The project requires a React portfolio application with its frontend, API and
database hosted entirely on Cloudflare. The original FastAPI/PostgreSQL backend
remains in Git history through commit `c44ee77`.

## Decision

Use React/TypeScript and Vite for the frontend, a TypeScript Worker for the API,
and D1 for persistence. Static assets and `/api` share an origin. See
`wrangler.jsonc`, `worker/index.ts` and `migrations/0001_initial.sql`.

Replace PostgreSQL exclusion constraints with ownership of 15-minute intervals:
the `(date, minute)` primary key in `occupied_slots` rejects overlap. SQL triggers
maintain those intervals during booking changes. Integration evidence is in
`worker-tests/api.test.ts`, including concurrent inserts and rollback.

## Consequences

One deployment serves the frontend and API. Python and PostgreSQL are no longer
runtime dependencies. The occupancy trigger currently generates at most five
intervals: longer services require a new migration and matching rule changes.
Migrations are explicit operations, separate from deployment. This decision does
not establish production readiness or prove that a particular commit is deployed.
