# Human setup and acceptance — 0.5.0

This is a homologation handoff, not authorization to release to real customers.
Use fictional people and separate resources. The owner must complete account
console actions and validate real Google behavior; local tests cannot establish
those external settings. Do not merge into the Cloudflare-connected main branch
before coordinating the schema/code release.

## Editable services — migration 0006

Implementation adds a tenant-owned service editor in /admin, dynamic public cards,
and immutable service terms on public and agreed bookings. Local verification is
separate from remote migration and owner acceptance. Migration 0006 has not been
applied remotely by the agent. Existing homologation currently has 0001–0005.

The bookings table must be rebuilt to remove the old fixed-service checks. The
migration copies every booking, backfills its original legacy terms, explicitly
preserves occupied slots through D1's cascading delete behavior, and keeps series,
audit and outbox rows intact. It does not rewrite existing durations or prices.
The previous Worker cannot create bookings against the new schema.

Coordinate a quiet homologation window first: close test browser tabs and stop
other testers/Preview writers, including scheduled or automated writes. If that
cannot be guaranteed, use a new isolated homologation database and update BOTH
Preview DB and PREVIEW_DB bindings before migrating. Do not touch production or
the older shared Preview. Do not merge main or run wrangler deploy for this step.

In the notebook's repository, on feat/product-readiness, with a clean checkout:

```powershell
git pull --ff-only
npm ci
npx wrangler d1 info PREVIEW_DB --config ./wrangler.preview-migrations.jsonc
```

Verify the database is slotiva-product-homologation with ID
74b37b6b-7f9e-40a3-b685-546d7a0a76ac (or the intentionally substituted new isolated
DB), and that the Preview binding matches it. Once old writers are stopped:

```powershell
npx wrangler d1 export PREVIEW_DB --remote --config ./wrangler.preview-migrations.jsonc --output "$env:TEMP/slotiva-before-services.sql"
npx wrangler d1 migrations apply PREVIEW_DB --remote --config ./wrangler.preview-migrations.jsonc
npx wrangler preview
Invoke-RestMethod "https://feat-product-readiness-slotiva.matheus-sergio.workers.dev/api/health"
```

Keep the backup private and outside Git. Require successful export before migration
and successful migration before Preview publication. If migration fails, stop and
inspect; do not publish mismatched code or try the old Worker as a rollback after a
successful schema change. Restore only through a deliberate isolated recovery.
If Preview publication fails after migration, keep the window closed and retry
publication of the matching revision. Only reopen testing after health succeeds.

Acceptance with fictional data:

1. In /admin > Seus serviços, add a named service with a description, 50 minutes
   and R$175.50. Check the professional's /p/{slug} card shows 50 min and R$175,50.
2. Submit a public request and create a weekly or fortnightly agreed series using
   that service. Check original terms and durations in receipts/agenda/storage.
3. Edit its name, duration and price. Existing bookings and their occupied time
   must keep the old terms; new bookings use the new version. A stale open page
   must receive a conflict and require review of refreshed terms.
4. Choose Gratuito, then Não divulgar valor. Public cards must distinguish those
   choices; undisclosed pricing must show neither a price nor "Gratuito".
5. Deactivate the service. It remains editable in /admin, disappears from public
   cards and the agreed-booking selector, and cannot receive new bookings.
   Pending requests can still move using their original duration; existing
   approvals, individual/series cancellations and Cancelados remain functional.
6. Check another professional's catalog is unchanged, and master cannot enter
   professional appointment/service APIs. Validate on mobile and by keyboard.

## Agenda and cancelled-history tabs — 2026-10-22

The owner requested a separate Cancelados tab to declutter the appointment area.
The professional UI defaults to Agenda and filters out status=cancelled. The
Cancelados tab displays that history with no booking action buttons. Each tab
shows its count, provides its own empty message, and supports arrows/Home/End.
This is a client-side display filter over the same authorized bookings endpoint;
no record is deleted and no backend, migration or authorization rule changes.
Statuses other than cancelled retain their existing placement in Agenda.

Verify: cancel one fictional appointment, check it disappears from Agenda and
appears in Cancelados; check counts, bulk cancellation and reload default. A
cancelled entry must have no approve/cancel action. Use keyboard navigation and
check empty states. Earlier screenshot instructions showing cancelled rows inline
are historical; use Cancelados for those checks after deploying this update.
Latest hosted acceptance of this layout remains pending.

## Current cancellation acceptance: only this or all — 2026-10-22

The owner reported another excessive cancellation after selecting November 6 and
requested two explicit choices: cancel only this encounter, or cancel all.
The accompanying cropped screenshots show October 30 at 13:00 still confirmed
and absent from public availability. They do not show every affected occurrence,
so the complete mutation scope cannot be independently established from them.

The updated UI now offers "Cancelar só esta" and "Cancelar todas da série", each
with confirmation. All means all future confirmed encounters in that same series,
including earlier future dates, while historical encounters remain unchanged.
The intermediate "from selected date onward" action is no longer in the UI; its
API is retained for compatibility. Latest acceptance is pending publication.

Recreate a fictional series and follow this concrete test:

1. Click Cancelar só esta on a middle encounter, dismiss its confirmation, and
   verify nothing changed. Repeat and confirm; only that occurrence is cancelled,
   its slot is released and the other encounters remain confirmed/occupied.
2. Click Cancelar todas da série from a remaining middle encounter and dismiss:
   verify no change. Repeat and confirm: all remaining future encounters in that
   series must be cancelled and released, including those before the clicked row.
3. Verify another series of the same professional and another professional's
   series remain unchanged. Repeat the bulk request to verify a safe no-op.

This supersedes the intermediate UI instructions in the historical section below.
Do not automatically restore previously cancelled encounters; recreate fictional
appointments only after checking available times. Local regressions are distinct
from owner acceptance and do not authorize a production release.

## Series cancellation acceptance and correction — 2026-10-22

The owner supplied screenshots showing weekly agreed appointments at 15:00 on
October 30, November 6 and November 13, with further confirmed dates through
December 4. A public screenshot for October 30 omitted the occupied 15:00 time.
Subsequent screenshots show October 30 cancelled and 15:00 available again while
November 13, 20, 27 and December 4 remain confirmed. This is evidence of weekly
creation, public occupancy and isolated occurrence cancellation, not fortnightly
or complete series-cutoff acceptance. No client contact details are retained here.

The owner then reported that cancelling the series cancelled everything. Inspection
confirmed the old API took only a series ID and cancelled every future encounter
from now, not from the clicked occurrence. Earlier test instructions promising
that November 13 would survive a click on November 20 did not match that code.
The correction requires fromBookingId and preserves encounters before the selected
row even if they are future. This fix is locally tested; hosted retest is pending.

The intermediate cutoff test below was replaced by the current two-choice UI
acceptance procedure above. The compatible fromBookingId API still requires its
anchor and preserves earlier future encounters. Do not infer tenant isolation,
fortnightly recurrence or concurrent conflict acceptance from these screenshots.

## Completed basic hosted booking cycle — 2026-10-22

Following the positive login/provisioning evidence below, the owner supplied a
screenshot showing the fictional October 29, 16:00 request as confirmed by the
professional. A public availability screenshot for the same date omitted 16:00;
the owner explicitly confirmed it was the same professional page despite changed
public header text. Subsequent paired screenshots show the reservation cancelled
in the agenda and 16:00 available again on October 29 for the same service/page.
No client contact details or account identifiers are retained here.

This completes the owner-observed basic cycle in the isolated Preview: public
request, professional approval, occupied time absent from availability,
professional cancellation, and time visible again. Evidence consists of owner
reports and screenshot inspection, not an independent agent browser run.

The customer's receipt after approval, actual concurrent conflicting submissions,
recurrence, series cancellation, negative authorization, suspension/revocation and
cross-professional isolation still require hosted acceptance. The visible time
list alone is not proof of a concurrent write-conflict test. Email and Calendar
integration remain unavailable. This is not production release approval.

## Latest owner acceptance evidence — 2026-10-22

After the native fetch receiver fix, the owner reported successful master sign-in
and creation of a fictional professional. The owner supplied the public page URL
`/p/profissionalteste` and a screenshot showing its professional name/header,
service selection and date picker. The owner then confirmed the flow works and
supplied a screenshot of the professional agenda showing a fictional public
request for October 29 at 16:00, pending approval, with Approve/Reject/Cancel
controls and an October 23 approval deadline. No account identifiers or client
contact details are retained in this acceptance record.

This is owner-reported hosted evidence plus screenshot inspection, distinct from
independent agent access. It establishes positive master access/provisioning,
public page rendering and a request visible in the professional agenda as pending.
It does not establish approval completion, customer receipt after approval,
double-booking prevention in that hosted flow, recurring agreements, cancellation,
unauthorized-account rejection, revocation or tenant isolation acceptance.

The subsequent basic-cycle evidence above supersedes the pending approval and
professional cancellation steps in this earlier record. Customer receipt and
concurrent conflict checks remain pending. Continue negative authorization,
recurrence and series cancellation checks below.
Email delivery and Google Calendar integration remain unimplemented.

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

### Recorded Preview secret setup — 2026-10-22

The owner supplied successful Wrangler output for Preview publication
9e7011cd and then Preview-scoped GOOGLE_CLIENT_SECRET creation on Worker slotiva,
Preview feat/product-readiness, deployment
55ae0ab2-27c3-4841-b6e3-af4cddd0c589. This confirms the operator reported saving a
secret under the correct name and scope; it does not validate its value or a
real OAuth exchange. No secret value was received or committed. The verified
master subject and real sign-in checks remain pending.

### Obtain the intended master's Google subject

An operator can obtain the account identity directly from Google's authenticated
UserInfo endpoint using the official OAuth 2.0 Playground. This procedure does
not change Slotiva's OAuth client or callback and does not replace Slotiva's
server-side ID-token verification.

1. Open [Google OAuth Playground](https://developers.google.com/oauthplayground/).
   Reset settings if previously customized. Keep OAuth endpoints set to Google,
   use the Playground's default client (leave Use your own OAuth credentials
   unchecked), and set Access type to Online. Do not enter Slotiva's Client Secret.
2. Under Step 1, enter scopes `openid email`, click Authorize APIs and personally
   select the intended master account. Review the requested identity permissions.
3. Under Step 2, click Exchange authorization code for tokens. Keep tokens inside
   the Playground; do not copy them into chat, logs or token-decoding websites.
4. Under Step 3, select GET and use the exact Request URI
   `https://openidconnect.googleapis.com/v1/userinfo`. Keep access-token placement
   as Authorization header with Bearer prefix. Click Send the request.
5. Require HTTP 200 and check that the returned email is the intended account
   and email_verified is true. Copy only the exact `sub` string into Wrangler's
   interactive MASTER_GOOGLE_SUBS prompt below. Preserve all digits. Do not use
   the OAuth Client ID, project number, email, or a subject from another account.

Google documents `sub` as an immutable account identifier and advertises public
subject identifiers in its discovery document. The authenticated Google UserInfo
response, rather than unverified JWT decoding, establishes the subject here.
After recording the subject privately, revoke the Playground grant in Google
Account's third-party connections; do not remove the Slotiva grant by mistake.

References: [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect),
[Google discovery document](https://accounts.google.com/.well-known/openid-configuration).

### Apply the public configuration and Preview secrets

From the repository on the Windows notebook, run these commands separately:

```powershell
git switch feat/product-readiness
git pull --ff-only
npx wrangler preview
npx wrangler preview secret put GOOGLE_CLIENT_SECRET --name feat/product-readiness
```

Enter the Client Secret only at Wrangler's interactive prompt. Do not place its
value in the command line, a file committed to Git, chat or a screenshot. This
updates the named existing Preview. Do not substitute `wrangler secret put`,
which targets the deployed Worker, or a Base secret shared with future Previews.

Only after the intended owner's Google subject has been independently verified,
run the following and enter that subject at the prompt:

```powershell
npx wrangler preview secret put MASTER_GOOGLE_SUBS --name feat/product-readiness
Invoke-RestMethod "https://feat-product-readiness-slotiva.matheus-sergio.workers.dev/api/auth/config"
```

Expected after complete setup: googleEnabled=true and passwordEnabled=false.
The first secret alone does not enable login: settings require a nonempty master
allowlist too. This repository currently has no automated subject-verification utility; use the
operator procedure above to obtain the verified master subject before proceeding. Do not invent a subject, use an email/client ID instead, or temporarily
open registration to resolve it. A true config flag proves configuration presence,
not a successful or correctly authorized sign-in; complete the role checks below.

Reference: [Cloudflare Preview secrets](https://developers.cloudflare.com/workers/previews/configuration/#secrets).

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
the service catalog is now editable; the buffer remains fixed at 15 minutes.

Create 4 weekly encounters and 4 fortnightly encounters at a fixed time. Check
all dates, local time and the final date. Repeat a request after an ambiguous
network failure and verify no duplication. Arrange a conflicting later occurrence:
the whole new series must fail with no partial dates. Confirm public availability
hides those occupied intervals and another professional can still use that time.
Exercise both current choices: Cancelar só esta must preserve all other
encounters; Cancelar todas da série must cancel every remaining future encounter
in that series, including earlier future dates. Check both confirmation-dismissal
paths, released slots, preserved history and no automatic renewal.

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

## Diagnose a login that returns to the login screen

On 2026-10-22 the owner reported googleEnabled=true/passwordEnabled=false and a
real sign-in attempt returning to /admin?google=failed. This proves configuration
presence and a failed callback, not a successful session or the cause of failure.
The earlier generic redirect cannot identify the failed stage.

Publish the diagnostic update to the isolated Preview, then start a fresh login
from the stable Preview host. Report only the final /admin?google=failed&reason=...
URL and the displayed message, never a callback URL containing code or state.

| Stage | Operator check |
| --- | --- |
| configuration | Verify all required Preview settings exist. |
| origin | Start on the configured stable PUBLIC_ORIGIN host. |
| transaction | Restart in one tab; check browser cookie blocking and expiration. |
| exchange | Confirm the matching Client ID/Client Secret, exact callback and retry a transient provider failure. |
| identity | Investigate token/JWKS verification and availability without sharing tokens. |
| authorization | Use the intended account; verify its exact Google sub against the Preview master allowlist or professional invitation. |
| session | Check D1 availability and applied session schema; do not change authentication checks. |
| internal | Investigate the unexpected server failure without exposing sensitive logs. |

After an authorized master login, verify the master screen and reject an unrelated
account. This diagnostic change has local automated coverage; hosted diagnosis and
successful real OAuth remain pending until the operator supplies new evidence.

### Token exchange detail — 2026-10-22

The owner repeated sign-in and reported reason=exchange. This narrows failure to
the code/token exchange or its response, before Google identity verification and
master authorization. It does not prove an incorrect Client Secret.
The next update distinguishes exact allowlisted Google error codes:

| Reason | Next action |
| --- | --- |
| exchange_invalid_client | Check the matching public Client ID and Client Secret; re-enter the secret only in the named Preview's Wrangler prompt if incorrect. |
| exchange_invalid_grant | Start a fresh login. If persistent, investigate exact redirect URI, client, code lifetime/reuse and PKCE. |
| exchange_unauthorized_client | Check Web application client type and permitted OAuth flow. |
| exchange_redirect_uri_mismatch | Check the registered exact callback and PUBLIC_ORIGIN. |
| exchange_invalid_request | Investigate the token request parameters without logging credentials. |
| exchange_unavailable | Restart after provider/network/rate-limit failure; investigate availability if persistent. |
| exchange | Google returned an unclassified/malformed error or token response; do not assume the secret is wrong. |

For this Preview the Client ID is the owner-supplied ID recorded above. Do not
change MASTER_GOOGLE_SUBS to troubleshoot exchange errors. Never copy provider
error descriptions, tokens or callback URLs into chat. Report only the final
reason and displayed guidance after publishing this update.

Reference: [Google Web server OAuth errors](https://developers.google.com/identity/protocols/oauth2/web-server).

### Native fetch receiver fix — 2026-10-22

The owner next reported exchange_unavailable. A new local test bundling the actual
Worker in workerd reproduced failure before any outbound token request. The default
deps.fetch held native fetch as an object method, giving it an invalid receiver.
Replacing that default with an arrow wrapper calling globalThis.fetch makes the
same test reach the intercepted token endpoint. This establishes a code defect and
its local correction; the hosted login still needs confirmation after publication.

Pull feat/product-readiness, publish its Preview and repeat a fresh master login.
Keep the current Client Secret and master subject unchanged for this verification.
If it fails, report only the safe final reason. A new provider/authorization error
may now be visible because the request actually reaches the next stage. Do not
claim successful real consent, credentials or session from this transport test.
