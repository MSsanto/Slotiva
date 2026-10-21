# Slotiva

**Available time slots that become appointments.** React/TypeScript, a Cloudflare
Worker and D1 serve the frontend and API from the same origin. The application
is in Portuguese; maintained documentation is in English. The browser title is
“Slotiva — horários livres que viram encontros.”

## Current increment: 0.5.0

- `/master`: Google-authenticated platform administration creates professionals,
  edits their headers, suspends/reactivates and removes accounts. It does not
  grant access to professionals' appointment APIs.
- `/p/{slug}`: each professional's own public booking URL, display name, header
  title, subtitle and forest/navy/plum theme. URLs are stable and never reused.
- `/admin`: a professional sees only their own appointments, hours and profile.
  Google authentication is separate from authorization; public signup is closed.
- Public requests start pending, at least 48 elapsed hours ahead and within the
  next 14 calendar days. The professional has 24 elapsed hours to approve.
  Rejection/expiry/cancellation releases held intervals. Confirmed customer
  rescheduling remains blocked until a change-proposal flow is implemented.
- After agreeing with a client, the professional can directly confirm a single
  appointment or a weekly/fortnightly fixed-time series. There are 1–26 explicit
  occurrences within 366 days, no automatic renewal. Any conflict rejects the
  whole series; retries cannot duplicate it. Cancel one occurrence or all future
  occurrences of a series; previous appointments remain in history.
- Occupancy keys include professional, date and minute. Two professionals can
  use the same time; concurrent overlaps for one professional cannot both win.
- Suspension revokes sessions and hides the public page. Deletion additionally
  cancels active appointments and frees slots; it preserves audit/history and is
  not a personal-data erasure procedure.

**Email and Google Calendar are not integrated yet.** Notification outbox rows
are durable intents, not sent messages. Calendar busy-time checks, event creation,
invites and recovery links remain pending. The current three services (30/45/60
minutes), 15-minute buffer and São Paulo timezone are fixed; per-professional
service configuration, clinical notes, payments and other timezones are not delivered.
No real-customer rollout is claimed.

## Run locally

Use Node.js 22.12+ or 24+ and npm. From the repository root:

```bash
npm ci
npm run build
npm run db:local
cp .dev.vars.example .dev.vars
npm run admin:hash
```

Put the generated hash in ADMIN_PASSWORD_HASH in the ignored `.dev.vars` file;
keep AUTH_MODE=demo and COOKIE_SECURE=false for local HTTP only. Run
`npm run dev:api` and, in another terminal, `npm run dev`. Open
http://localhost:5173; Vite forwards API traffic to Wrangler at port 8787.
The local demo uses a fictional professional and password access at `/admin`.
The built app also runs at http://localhost:8787. Never paste passwords or
client secrets into chat or Git. Google testing needs a separate OAuth client,
canonical callback host and master authorization: [setup](docs/HUMAN_VALIDATION.md).

## Authentication and data boundaries

Hosted product environments use AUTH_MODE=google: password login and legacy
password sessions are rejected. Unknown modes also disable passwords. Google
uses server-side authorization code, PKCE, one-use state/browser binding, nonce,
verified signature/issuer/audience/expiry and a rotating eight-hour own session.
MASTER_GOOGLE_SUBS bootstraps master subjects. The master invites professionals;
verified authoritative Gmail/Workspace addresses can bind once to an immutable
Google subject. Other Google-account addresses require explicit subject provisioning.
A valid Google account alone grants no access. Roles and active status are checked
on every protected request. [Protocol and decision](docs/GOOGLE_AUTH.md).

Sessions are random, hashed in D1, HttpOnly, SameSite=Lax, Secure when hosted and
scoped to `/api`. Mutations require an exact Origin. Demo PBKDF2 uses 100,000
iterations and five attempts per IP per 15 minutes. Rotating a demo password hash
does not revoke existing demo sessions. Public API responses are no-store.
A customer's random capability token is kept only in React memory; reload loses
self-service access. Contact information is not proof of identity. There is no
customer directory or recovered email login yet. Use fictional data until pilot
acceptance. Do not store diagnoses or session content.

## Deployment boundary

`wrangler.jsonc` retains the existing production target and demo mode; it has NOT
been deployed by this increment. `main` is connected to Cloudflare Builds, so a
merge may trigger a release and must follow a coordinated migration window.
Migration 0002 changes booking transitions; 0003 adds identity; 0004 partitions
professionals; 0005 adds finite agreed series. Existing bookings become confirmed
or cancelled and belong to demo; no retroactive invitations are generated.
Never run an older Worker against the new write contract.

This branch deliberately configures **no Preview D1 binding**. Its old shared
Preview migration configuration is disabled as well. The old Preview database
must stay untouched while an incompatible Preview can write to it. A new isolated
homologation database must be bound to both the Preview and migration config
before testing. Do not restore the old UUID, inherit production storage, or use
`npm run db:remote` for Preview. Follow [the concrete human setup and validation
runbook](docs/HUMAN_VALIDATION.md). A successful upload without a configured D1
is not a working booking deployment.

## Verification

```bash
npm run format:check
npm run lint
npm test
npm run test:worker
npm run build
npx wrangler deploy --dry-run
node --test scripts/check-docs.test.mjs
node scripts/check-docs.mjs <full-base-commit-sha>
```

Worker tests use the real bundled API in Miniflare/workerd and isolated local D1.
They cover occupancy races, rollback, approval deadlines/versions, legacy upgrades,
OAuth signature/state/nonce/PKCE, revocation, master authorization, tenant isolation,
profile edits, deletion and atomic/retry-safe recurrence. Google exchange tests
use signed synthetic identities, not real consent or production credentials.

For browser tests, in an isolated checkout with no `.dev.vars`:

```bash
node scripts/test-env.mjs
npm run db:local
npm run dev:api -- --var COOKIE_SECURE:false
# Another terminal:
npm run test:e2e
```

Playwright covers request/edit/approval/cancellation, a professional's fortnightly
series, a master CRUD screen with API fixtures, and Google setup without password
fallback. Initial booking-screen axe scans at two viewport sizes and a mobile
keyboard/overflow check do not replace a full manual accessibility audit.
CI runs disposable local storage. Passing CI does not prove a remote migration,
real OAuth setup, notification delivery or production readiness.

## Documentation and governance

[Documentation index](docs/README.md) · [API](docs/API.md) ·
[Product requirements](docs/SLOTIVA_DOCUMENTACAO_PRODUTO_V1.md) ·
[Documentation control](docs/DOCUMENTATION.md) · [Changelog](CHANGELOG.md).

Every change must be implemented and documented on GitHub, in a reviewable PR.
Documentation CI enforces affected-file updates and local links; human review
checks semantics and English. Repository branch rules must separately enforce
mandatory checks and reviews. Local-only work is not a completed delivery.
The initial FastAPI/PostgreSQL implementation remains in Git history through
c44ee77; [ADR 001](docs/ADR-001-cloudflare.md) records its replacement.
