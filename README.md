# Slotiva

**Horários livres que viram encontros.**

Appointment booking built with React, TypeScript, Vite, Cloudflare Workers and D1.
The frontend and API share one deployment.

[Demo](https://slotiva.matheus-sergio.workers.dev)

## Current version

- One demo professional with 30, 45 and 60-minute services.
- Editable weekly hours, 30-minute starts and a 15-minute buffer.
- Booking, rescheduling and cancellation with database conflict protection.
- Password-protected administration.
- Availability from tomorrow through the next 14 days, in Brasília time.

Google sign-in, multiple professionals, approval deadlines and Calendar integration
are being developed separately. See the [roadmap](docs/ROADMAP.md).

## Run locally

Requires Node.js 22.12+ or 24+.

```bash
npm ci
npm run build
npm run db:local
cp .dev.vars.example .dev.vars
npm run admin:hash
```

Copy the generated hash into `ADMIN_PASSWORD_HASH` in `.dev.vars`.
Use `COOKIE_SECURE=false` only for local HTTP.

```bash
npm run dev:api
# In another terminal:
npm run dev
```

Open http://localhost:5173; administration is at `/admin`.
Vite proxies API requests to Wrangler on port 8787.

## Design

SQL triggers maintain occupied intervals in the same transaction as booking
changes. A unique `(date, minute)` key prevents concurrent overlaps. A failed
reschedule rolls back to the original time.

Administrative sessions use random tokens hashed in D1, eight-hour expiry and
HttpOnly cookies. Mutations check Origin; password attempts are rate-limited.
Customers use a separate booking token kept in browser memory. Reload loses
customer self-service access; email recovery is not available yet.

## Checks

```bash
npm run lint
npm run format:check
npm test
npm run test:worker
npm run build
```

Worker tests run against isolated local D1 databases. For Playwright, use a
separate checkout, install Chromium, run `node scripts/test-env.mjs`, apply local
migrations and start the API with `COOKIE_SECURE=false`, then run
`npm run test:e2e`.

## Deploy

`wrangler.jsonc` configures the Worker and D1 binding. Configure the database,
apply migrations and store the password hash with Wrangler before deployment.
`main` is connected to Cloudflare Builds; migrations are a separate operation.
Use isolated databases for Preview and fictional data in the demo.

[Documentation](docs/README.md) · [Changelog](CHANGELOG.md) ·
[Contributing](CONTRIBUTING.md)
