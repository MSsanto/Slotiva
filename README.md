# Slotiva

**Accessible appointment booking with React, TypeScript, FastAPI and PostgreSQL.**

A portfolio MVP for one independent professional. Customers reserve, reschedule and cancel appointments; the professional signs in to manage bookings and weekly availability.

## Stack

- React + TypeScript + Vite; React Router for screens.
- TanStack Query for server state, loading/error states and cache invalidation.
- React Hook Form + Zod for contact validation.
- FastAPI + Pydantic; psycopg and PostgreSQL 16.
- Vitest, pytest, Playwright and axe; GitHub Actions.

## Local setup

Requires Node 22.12+ or 24+, Python 3.12+, and Docker Compose.

```bash
npm ci
python -m venv .venv
# Linux/macOS:
source .venv/bin/activate
# Windows PowerShell instead: .venv\Scripts\Activate.ps1
pip install -r backend/requirements-dev.txt
cp .env.example .env
cd backend
python -m slotiva.security
cd ..
```

The command prompts for a password of at least 12 characters and prints a salted scrypt hash. Put that hash in `ADMIN_PASSWORD_HASH` in `.env`, and replace `POSTGRES_PASSWORD` with a strong URL-safe random value. Never commit `.env` or actual passwords.

```bash
docker compose up --build -d
npm run dev
```

Open http://localhost:5173. `/admin` requires the password you chose. API documentation: http://localhost:8000/docs. PostgreSQL is kept on the private Compose network; the API port binds to loopback. Vite proxies `/api` to the backend, keeping cookies on the same origin.

Without Docker, run PostgreSQL 16 separately, export `DATABASE_URL`, `ADMIN_PASSWORD_HASH`, `COOKIE_SECURE=false`, `ALLOWED_ORIGINS=http://localhost:5173`, then:

```bash
cd backend
python -m slotiva.db
uvicorn slotiva.main:app --port 8000 --no-access-log
```

## Booking rules

- Single professional; three fixed services of 30, 45 and 60 minutes.
- Booking horizon: tomorrow through 14 days ahead in **America/Sao_Paulo**.
- Weekly opening hours are editable; default Monday–Friday, 09:00–17:00.
- Start times every 30 minutes; each appointment occupies its duration **plus 15 minutes of buffer**. The buffer must fit within opening hours.
- PostgreSQL's GiST exclusion constraint rejects overlapping `[start, occupied_until)` ranges for active bookings. This protects writes independently of the UI and even of the API service.
- Conflict responses use HTTP 409. Rescheduling rolls back on conflict, preserving the original reservation.
- Schedule changes and booking writes coordinate with a transaction advisory lock. Existing reservations cannot be invalidated by shortening opening hours. The same lock avoids deadlock-prone concurrent exclusion checks on API writes. The raw SQL test retries a deadlock-aborted transaction and still requires an exclusion violation and exactly one persisted booking.
- Date keys come from the backend's professional calendar, independent of the visitor's timezone.

## Security and data boundaries

- Administrator sessions use random opaque tokens; only SHA-256 token hashes are stored in PostgreSQL, with an eight-hour expiry.
- Session cookie: HttpOnly, SameSite=Lax, restricted to `/api/admin`. `COOKIE_SECURE=false` is only for local HTTP; enable it with HTTPS.
- Administrative mutations and login require an exact allowlisted Origin. Login attempts are limited per direct client IP to five per 15-minute window using PostgreSQL. Behind a proxy, configure trusted forwarded headers deliberately.
- Customer cancellation/rescheduling requires a separate unguessable token, returned only at creation. It is kept in React memory, not in URL parameters or browser storage. Leaving/reloading the page loses self-service access; an authenticated professional can still cancel.
- Responses use `Cache-Control: no-store`. No localStorage customer records, no public listing of clients, and no email notification delivery.
- Use fictional data in demonstrations. The professional is fictional. This is not a multi-tenant production service.

## Tests

```bash
npm run lint
npm test
npm run build
python -m pytest -q
```

Without `TEST_DATABASE_URL`, pytest explicitly skips integration tests; it never silently substitutes SQLite. To run the full suite, point `TEST_DATABASE_URL` to a **dedicated disposable PostgreSQL database**. Integration fixtures truncate application tables in that database.

Integration coverage includes two simultaneous HTTP requests (one 201, one 409), concurrent raw SQL inserts proving the database constraint, buffer overlap, cancellation authorization, rescheduling rollback, administrative authentication, Origin validation, logout, schedule changes, migration repeatability and login rate limiting.

With the API running against a disposable database, the admin password set to `test-password-long`, and an empty agenda:

```bash
npx playwright install chromium
npm run test:e2e
```

Playwright starts Vite. Browser tests cover booking → rescheduling → admin login → persisted agenda → cancellation → logout, plus mobile overflow, keyboard entry and an automated WCAG AA scan. Automated checks do not replace a manual accessibility audit.

CI provisions PostgreSQL 16 and executes all checks, including browser tests.

## Architecture

```text
src/pages/          Booking and authenticated administration screens
src/api.ts          API client, typed contracts and calendar presentation
backend/slotiva/
  main.py           HTTP routes and exception mapping
  models.py         Input validation
  services.py       Booking/schedule business rules and transactions
  security.py       Passwords, sessions, Origin checks and login throttling
  db.py, schema.sql PostgreSQL connection and versioned initial schema
```

## Hosting and next work

No public deployment is configured yet. A complete deployment needs a PostgreSQL database, an API runtime and a frontend host/reverse proxy forwarding `/api` to FastAPI and other routes to `index.html`. Set exact production origins and secure cookies; provision credentials through the host's secret store. A static-only host cannot run the full product.

Pending: English locale, manual accessibility review, date exceptions/holidays, production observability, customer recovery/notification flow, broader abuse protection and backup/retention policy. Payments and multi-professional organizations remain out of scope.
