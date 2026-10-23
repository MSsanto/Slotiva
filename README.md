# Slotiva

**Horários livres que viram encontros.**

Appointment scheduling for independent professionals. Each professional has a
public booking page and a private agenda. Customers request a time without
creating an account; the professional approves or rejects the request.

Built with React, TypeScript, Vite, Cloudflare Workers and D1.

## Features

- Google sign-in, professional invitations and separate administrator access.
- Public pages at `/p/{slug}`, with editable branding, services and working hours.
- Booking requests with 48-hour notice and a 24-hour approval deadline.
- Direct entry of agreed appointments, including finite weekly or fortnightly series.
- Conflict protection in the database and cancellation history.
- Separate Google Calendar consent and manual lookup of occupied intervals.

Calendar connection is still being validated in Preview. External conflicts are
not checked automatically; event creation, invitations and email delivery are
pending. Customer self-service currently depends on a token held in browser memory
and is lost on reload. See the [roadmap](docs/ROADMAP.md).

## Local development

Requires Node.js 22.12+ or 24+.

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run admin:hash
```

Copy the generated hash into `ADMIN_PASSWORD_HASH` in `.dev.vars`.
Keep `AUTH_MODE=demo` and `COOKIE_SECURE=false` for local HTTP.

```bash
npm run db:local
npm run dev:api
# In another terminal:
npm run dev
```

Open http://localhost:5173. Vite proxies API requests to Wrangler on port 8787.
The local demo uses a fictional professional and password login at `/admin`.

## Checks

```bash
npm run lint
npm run format:check
npm test
npm run test:worker
npm run build
node --test scripts/check-docs.test.mjs
node scripts/check-docs.mjs
```

Worker tests run against isolated D1 databases in Miniflare. For browser tests,
use a separate checkout with no `.dev.vars`:

```bash
npx playwright install chromium
node scripts/test-env.mjs
npm run db:local
npm run dev:api -- --var COOKIE_SECURE:false
# In another terminal:
npm run test:e2e
```

The fixture script creates the test password expected by Playwright. CI uses the
same isolated setup.

## Deployment

Frontend assets and the API share a Worker. Preview uses a separate D1 database.
Google credentials and the Calendar encryption key are server secrets.

`main` is connected to Cloudflare Builds. Schema changes must be coordinated
with the matching Worker version, particularly migrations 0006–0007, which
rebuild booking tables. See [operations](docs/OPERATIONS.md) before deploying.

[Architecture](docs/ARCHITECTURE.md) · [API](docs/API.md) ·
[Calendar setup](docs/CALENDAR_CONNECTION.md) · [Changelog](CHANGELOG.md) ·
[Contributing](CONTRIBUTING.md)
