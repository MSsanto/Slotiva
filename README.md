# Slotiva

**Available time slots that become appointments.** React/TypeScript, a Cloudflare
Worker and D1 serve the frontend and API from the same origin. The application
is in Portuguese; maintained documentation is in English. The browser title is
“Slotiva — horários livres que viram encontros.”

## Current increment: 0.5.0

- The professional agenda opens on the Agenda tab, which excludes cancelled
  bookings. Cancelados keeps their read-only history and counts; cancellations
  move out of Agenda after refresh. Tabs support arrow keys, Home and End.
- `/master`: Google-authenticated platform administration creates professionals,
  edits their headers, suspends/reactivates and removes accounts. It does not
  grant access to professionals' appointment APIs.
- `/p/{slug}`: each professional's own public booking URL, display name, header
  title, subtitle and forest/navy/plum theme. URLs are stable and never reused.
- `/admin`: a professional sees only their own appointments, hours and profile.
  Administrative fields use consistent readable inputs and visible select focus.
  Google authentication is separate from authorization; public signup is closed.
- Public requests start pending, at least 48 elapsed hours ahead and within the
  next 14 calendar days. The professional has 24 elapsed hours to approve.
  Rejection/expiry/cancellation releases held intervals. Confirmed customer
  rescheduling remains blocked until a change-proposal flow is implemented.
- After agreeing with a client, the professional can directly confirm a single
  appointment or a weekly/fortnightly fixed-time series. There are 1–26 explicit
  occurrences within 366 days, no automatic renewal. Any conflict rejects the
  whole series; retries cannot duplicate it. Series rows offer two explicit choices:
  "Cancelar só esta" preserves all other encounters; "Cancelar todas da série"
  cancels every future confirmed encounter in that series, preserving past history.
  Each choice requires confirmation. Other series/professionals are unaffected.
- Occupancy keys include professional, date and minute. Two professionals can
  use the same time; concurrent overlaps for one professional cannot both win.
- Suspension revokes sessions and hides the public page. Deletion additionally
  cancels active appointments and frees slots; it preserves audit/history and is
  not a personal-data erasure procedure.

**Email, Calendar event synchronization and invitations remain pending.**
A separate Google Calendar connection and manual primary-calendar availability
lookup are implemented; external consent/setup and hosted acceptance remain pending.
The panel requests read-only free/busy permission and does not enforce external
conflicts in scheduling yet. Notification outbox rows are durable intents, not sent
messages. See [Calendar connection setup](docs/CALENDAR_CONNECTION.md). Professionals can create, edit and
deactivate their own services: name, description, optional duration (15–240 minutes
in 5-minute steps when provided), and paid, free or undisclosed pricing. Paid prices
may also remain blank (to be agreed); blank is never zero or free. Services without
a fixed duration use direct scheduling with the professional, who supplies the
encounter duration when entering an agreement. Existing bookings keep
immutable service terms. Storage enforces whole-minute durations and integer
price cents as well as API validation. Starts remain every 30 minutes, with a 15-minute buffer
and São Paulo timezone. Clinical notes, payments and other timezones are not delivered.
The owner reported successful service editing with blank duration/paid amount in
Ana's profile and successful login on 2026-10-22. This is owner-reported acceptance
of that flow, not acceptance of every tenant/negative scenario or the new Calendar
connection. No real-customer rollout is claimed.

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
professionals; 0005 adds finite agreed series; 0006 adds professional service
catalogs and preserves original booking terms; 0007 makes catalog duration and
paid amount optional without erasing existing data; 0008 adds isolated encrypted
Calendar connections and session-bound consent transactions. Existing bookings become confirmed
or cancelled and belong to demo; no retroactive invitations are generated.
Never run an older Worker against the new write contract.

Preview binding DB and the separate migration binding PREVIEW_DB now both target
`slotiva-product-homologation` (`74b37b6b-7f9e-40a3-b685-546d7a0a76ac`), created
by the owner on 2026-10-21. It differs from production and the older shared
Preview database. Local development has no remote=true override. Apply the new
schema only through the dedicated config. Migrations 0006–0007 rebuild bookings and
requires a coordinated quiet window: stop old Preview writers, export a backup,
apply the migration and immediately publish matching code. Follow the exact
[service release procedure](docs/HUMAN_VALIDATION.md#editable-services--migration-0006).
Do not apply it while the old Worker can write. After establishing that window:

```powershell
npx wrangler d1 migrations apply PREVIEW_DB --remote --config ./wrangler.preview-migrations.jsonc
npx wrangler preview
```

Migrations 0006–0007 have been tested locally, but remote application and hosted service
acceptance remain pending. The owner's Wrangler output confirms database creation and successful remote
application of migrations 0001–0005 on 2026-10-21 to this exact homologation ID.
The owner also supplied a successful 0.5.0 Preview upload for this branch at
https://feat-product-readiness-slotiva.matheus-sergio.workers.dev.
PUBLIC_ORIGIN is set to that stable Preview origin, and the owner-supplied public
GOOGLE_CLIENT_ID is registered only in previews.vars. On 2026-10-22 the owner supplied successful Preview-scoped Client Secret creation
output. After the native transport fix, the owner reported successful master sign-in and
professional creation, and supplied public-page and pending-request agenda
screenshots. Further screenshots show professional approval, occupied time absent
from public availability, cancellation and that time available again on the same
professional page. Customer receipt, concurrent conflict submissions and remaining
negative/role/recurrence acceptance are still pending; see
[human validation](docs/HUMAN_VALIDATION.md). The owner’s notebook checks returned
health status=ok/storage=D1/approvalWorkflow=true and auth config
googleEnabled=false/passwordEnabled=false. This establishes the hosted schema
probe and closed password access, not successful Google login. Earlier agent
probes received 403/code 1010; that result did not establish a D1 fault. The old
Preview must stay untouched while an incompatible Worker writes. Do not use
npm run db:remote for homologation. If the D1 creation wizard modified your local
wrangler.jsonc, back it up outside the repository and restore only that file's
wizard changes before pulling the reviewed configuration. Keep binding names DB
and PREVIEW_DB; do not add slotiva_product_homologation or remote=true as a local
development substitute. Follow [human setup and validation](docs/HUMAN_VALIDATION.md).

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

Google callback failures now return a fixed diagnostic stage on the login page
(transaction, exchange, identity, authorization, session, configuration or origin).
Token exchange also reports allowlisted Google error codes (invalid_client,
invalid_grant, unauthorized_client, redirect_uri_mismatch and invalid_request),
or exchange_unavailable for connection/server/rate-limit failures. These stages
help distinguish setup failures without exposing raw Google responses, tokens,
subjects or database errors. A configuration flag alone does
not establish a successful login. See [callback contract](docs/API.md) and
[human diagnosis](docs/HUMAN_VALIDATION.md).

The default Google token transport wraps globalThis.fetch so workerd receives the
correct global receiver. A runtime regression test bundles the actual Worker,
starts OAuth against D1, and intercepts outbound transport without replacing
native fetch. The previous dependency-object call failed before network I/O even
though Node-based mock tests passed. Real hosted sign-in still requires acceptance.


## Calendar callback diagnostics

Calendar callback failures now redirect to a fixed calendar_reason code and show actionable Portuguese guidance. Reasons distinguish configuration, session/transaction, consent, token exchange, grant/scope, identity/account, encryption and storage. Provider text, tokens and account identifiers are never reflected. This diagnoses a failed connection; it does not establish successful hosted consent.
