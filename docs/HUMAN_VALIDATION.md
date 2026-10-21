# Human setup and acceptance — 0.5.0

This is a homologation handoff, not authorization to release to real customers.
Use fictional people and separate resources. The owner must complete account
console actions and validate real Google behavior; local tests cannot establish
those external settings. Do not merge into the Cloudflare-connected main branch
before coordinating the schema/code release.

## 1. Prepare isolated storage and the exact branch

Check out the PR branch, pull it and run npm ci. Read migrations 0002–0005 and
inspect `git status`. Never apply them to the older shared Preview database
77552831-ed97-4662-830a-2c7b318add96 or production while an old Worker writes.
The owner created the dedicated `slotiva-product-homologation` D1 on 2026-10-21,
ID `74b37b6b-7f9e-40a3-b685-546d7a0a76ac`, through authenticated Wrangler.
The reviewed Preview config binds it as DB; the migration-only config binds the
same ID as PREVIEW_DB. Production remains on its original DB; no remote=true
local-development override is introduced. Do not create another database merely
to repeat this already completed step.

The creation wizard was allowed to edit the owner's local wrangler.jsonc using
binding slotiva_product_homologation and remote local development. Back up that
local file outside the checkout, then restore its wizard changes before pulling
the reviewed branch. For example, after confirming this is the wizard-edited file:

```powershell
Copy-Item .\wrangler.jsonc "$env:TEMP\slotiva-wrangler-before-sync.jsonc"
git restore --source=HEAD -- wrangler.jsonc
git pull --ff-only
Get-Content .\wrangler.preview-migrations.jsonc
```

The backup preserves the wizard-generated settings for review. Inspect any other
local changes instead of resetting the whole working tree. Before the command
below, confirm the config displays the new ID, binding PREVIEW_DB and migrations_dir
migrations. The ID must differ from both production and the older shared Preview.

```powershell
npx wrangler d1 migrations apply PREVIEW_DB --remote --config ./wrangler.preview-migrations.jsonc
npx wrangler preview
```

The first command mutates ONLY the newly reviewed homologation D1. Do not use
npm run db:remote, which targets production. Confirm the displayed resource ID
before accepting any migration prompt. A missing or incorrect binding should fail, not choose
another database. Check `/api/health` after the Preview has its binding.

### Recorded migration evidence — 2026-10-21

The owner supplied terminal output for the migration command above. It identifies
remote PREVIEW_DB as `74b37b6b-7f9e-40a3-b685-546d7a0a76ac` and reports all five
migrations successful: 0001_initial.sql, 0002_professional_approval.sql,
0003_google_login.sql, 0004_professional_tenants.sql and
0005_professional_recurrence.sql. This is operator-provided execution evidence,
not an independent agent query of the remote schema. No production migration is
shown by that output. Do not rerun initial setup to try to create another database.

Next, deploy/update this branch's Preview with npx wrangler preview. Record the
stable Preview URL and query its /api/health before setting the exact Google
callback origin. A successful D1 migration alone does not establish a healthy
Worker, OAuth configuration or practitioner acceptance. Google login should remain
setup-pending until the credentials and master identity are configured.

### Recorded Preview publication — 2026-10-21

The owner supplied successful Wrangler Preview output for feat/product-readiness,
application version 0.5.0, unique deployment 3e08d642. Stable URL:
https://feat-product-readiness-slotiva.matheus-sergio.workers.dev.
The agent's HTTP probes to /api/health and /api/auth/config received 403 with
body error code 1010; the web retrieval fallback could not access either endpoint.
This does not establish healthy API responses or diagnose a D1/application fault.
Check from the authenticated operator's notebook without weakening Cloudflare rules:

```powershell
Invoke-RestMethod "https://feat-product-readiness-slotiva.matheus-sergio.workers.dev/api/health"
Invoke-RestMethod "https://feat-product-readiness-slotiva.matheus-sergio.workers.dev/api/auth/config"
```

The owner subsequently ran those exact notebook checks and supplied:
health status=ok, storage=D1, approvalWorkflow=true; auth config
googleEnabled=false, passwordEnabled=false. This confirms the schema probe and
disabled password access from that network. It does not establish real Google
consent, master authorization or end-to-end appointment acceptance. The configured PUBLIC_ORIGIN now uses this
stable Preview host; publish its config update before testing Google redirects.

## 2. Configure Google and bootstrap a master

### Supplied OAuth Client ID (2026-10-21)

The owner supplied the **public** OAuth Web Client ID `1021260164493-bcse5qjedmr74meajund6fipmbt98g9r.apps.googleusercontent.com`.
This PR configures it **only under `previews.vars.GOOGLE_CLIENT_ID`** in
`wrangler.jsonc`. It does not configure production, authorize users or
demonstrate successful sign-in. The owner must verify that the supplied client
is of type **Web application** in the intended Google Cloud project and that
the exact callback below is on that client's authorized redirect URI list.
Since this is a server-side authorization-code flow, do not add a second
Google Identity Services React login or place the Client Secret in Vite.

Configure `GOOGLE_CLIENT_SECRET` and `MASTER_GOOGLE_SUBS` as **Preview-scoped
secrets** with authenticated Cloudflare tooling/dashboard, never in Git.
The master value is the verified immutable Google account `sub`, **not an
email address or OAuth Client ID**. Re-publish the isolated Preview with this
branch's config, then verify `/api/auth/config` changes to
`googleEnabled=true` and exercise a valid and denied login. Check the
secrets' actual Preview scope before declaring OAuth ready. If
`googleEnabled=false`, inspect missing environment bindings without printing
their values. Do not switch to demo mode or touch production to make it pass.

**Operator acceptance evidence still required:** client type/callback confirmed,
test-user consent configured, Preview secrets set, authorized master sign-in,
unauthorized identity denied, logout/revocation and no token leakage.

## 2. Configure Google and bootstrap a master

Create a separate Google OAuth Web client and consent configuration for testing.
Authorize test accounts. Register the exact stable Preview-origin callback
`https://feat-product-readiness-slotiva.matheus-sergio.workers.dev/api/admin/google/callback`; deployment-specific
unique URLs are unsuitable for a stable configured callback. Identity scopes
are openid/email/profile. Do not request Calendar scopes in this increment.

### Create the Google Web client

1. Select a separate test project in Google Cloud Console, for example
   Slotiva Homologation. Open Google Auth platform > Branding and complete app
   name, support email and developer contact information.
2. In Audience, choose External for testing with personal Google accounts, keep
   the app in Testing, and add the intended master/test accounts as test users.
3. In Clients, create a Web application OAuth client named Slotiva Homologation.
   Register the exact stable Preview callback shown above under Authorized
   redirect URIs. The deployment-specific unique URL is not the callback.
4. Keep Client ID and Client Secret privately for configuration in the correct
   Preview environment. Do not commit downloaded client JSON or share secrets
   in chat. Creating the client alone does not enable master access: the verified
   master subject and environment settings below are still required.

References: [Google consent setup](https://developers.google.com/workspace/guides/configure-oauth-consent)
and [server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

In the correct homologation/Preview environment, configure AUTH_MODE=google,
COOKIE_SECURE=true, PUBLIC_ORIGIN as the exact HTTPS origin without a trailing
slash, GOOGLE_CLIENT_ID, and secret GOOGLE_CLIENT_SECRET. Configure the secret
MASTER_GOOGLE_SUBS using the intended owner's verified immutable Google sub.
Use a trusted Google identity-verification process; do not obtain the subject
from unverified frontend decoding or a random token-inspection website. A master
subject is required before this app enables Google login; there is no public
bootstrap endpoint. Confirm how the Cloudflare dashboard scopes Preview secrets;
do not assume production secrets are inherited. Never paste tokens/secrets into
chat, PRs, logs or screenshots. Do not enable demo/password fallback to bypass setup.

These actions require access to the owner's Google/Cloudflare accounts and
selection of the authorized identity. They are the external human setup boundary.

## 3. Exercise roles and public profiles

- Sign in as the authorized master at `/master`; verify Google redirects there.
  An unrelated Google account must fail, and the password form must be absent.
- Create fictional professionals A and B with different email invitations/slugs
  and headers/themes. Use a verified Gmail/Workspace invitation or provision a
  trusted exact subject for another Google-account email domain.
- Open each `/p/{slug}`; check the correct header on desktop/mobile. The public
  profile response must not expose email, Google identity or appointment data.
- Sign in as A and B independently. Each sees only their own agenda/hours/profile.
  Changing B's booking ID in A's requests must not grant access; a master must not
  read professional appointment APIs.
- Edit A's header; B stays unchanged. Two screens editing the same old profile
  version must receive a conflict rather than silently overwriting each other.
- Suspend A: page hidden, old sessions revoked. Reactivate A: fresh login required.
  Delete a fictional profile with active bookings: page disappears, sessions are
  revoked, active bookings are cancelled and slots freed, historical rows/events
  remain. Confirm retired slugs cannot be registered again.

## 4. Practitioner workflow and public requests

With the psychologist, use fictional client identifiers. Confirm actual session
duration, break, working days, desired quantity/end and cancellation practice;
the current catalog/buffer are fixed and may require another increment.

Create 4 weekly encounters and 4 fortnightly encounters at a fixed time. Check
all dates, local time and the final date. Repeat a request after an ambiguous
network failure and verify no duplication. Arrange a conflicting later occurrence:
the whole new series must fail with no partial dates. Confirm public availability
hides those occupied intervals and another professional can still use that time.
Cancel one occurrence, then cancel the remaining future series. Verify released
slots and preserved history. Confirm no automatic renewal is expected.

Exercise a public request (>=48h, within 14 days), pending status/deadline,
professional approval/rejection, customer status polling and cancellation. At
24h a pending request expires and frees its hold; confirm Cron activation where
applicable. Pending edits keep the original deadline; confirmed rescheduling
returns the contact-professional instruction. Reload loses customer capability:
email recovery remains pending. No email or Calendar invite should be claimed.

Check keyboard focus, screen reader labels/errors, mobile overflow, contrast and
confirmation wording on master/profile/recurrence/booking screens. Verify Google
consent rejection, expired state, logout, blocked unauthorized identities and
session revocation in actual browsers.

## 5. Release gate and remaining work

Record the tested commit, isolated database ID, deployment URL, test accounts
without credentials, observed outcomes, practitioner decisions and open defects
in a GitHub acceptance issue/PR. Require passing Slotiva CI and Documentation
checks and human review. The observed main branch was unprotected on 2026-10-21;
configure repository rules requiring PRs, review and the displayed checks through
an account with administration rights. A CI workflow alone does not enforce merges.

Before real customers: implement and validate transactional email/recovery,
Calendar authorization/event/busy-time integration, safe delivery retries and
reconciliation; agree services and cancellation policies; establish public abuse
controls, retention/export/erasure, support, monitoring and a tested backup restore.
The proposed RPO 24h/RTO 4h are targets, not demonstrated guarantees.

For an eventual production release, authorize backups and a maintenance window,
pause old writers, apply reviewed additive migrations and deploy the matching
Worker, then validate before reopening. Never roll back only the Worker to an
incompatible schema. Prepare a compatible schema/data restoration plan. No
production deployment is established by this handoff. The owner-reported remote
homologation migration is recorded above; production release remains separate.
