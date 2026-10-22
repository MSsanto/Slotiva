# Slotiva API — 0.5.0

Same-origin `/api`; JSON, no-store. Invalid payloads: 422; missing sessions: 401;
wrong role/origin: 403; unknown/inaccessible resource: 404; overlap, stale version
or reused conflicting operation: 409; unconfigured/unavailable storage: 503.
Admin/master mutations require an exact Origin and an HttpOnly session cookie.
No caller-provided professional ID chooses the authenticated tenant.

## Public professional page

`GET /api/public/{slug}/profile` returns id, slug, displayName, headerTitle,
headerSubtitle and theme. It never exposes email, Google subject or version.
Suspended/deleted/unknown profiles return 404. In Google mode the fictional demo
profile is hidden. `/p/{slug}` is the corresponding frontend URL.

| Method and route (prefix `/api/public/{slug}`) | Contract                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| GET /services                                  | Active services owned by this professional; see service contract below                         |
| GET /calendar                                  | today, timezone, horizonDays=14, minimumNoticeHours=48, approvalWindowHours=24             |
| GET /availability?date=YYYY-MM-DD&serviceId=…  | Free HH:mm starts; tenant hours, active holds and 48h notice applied                       |
| POST /bookings                                 | `{serviceId,serviceVersion,date,time,name,email}`; 201 pending receipt plus one-time returned cancelToken |

The unscoped equivalents `/api/services`, `/api/calendar`, `/api/availability`
and POST `/api/bookings` are demo compatibility routes, disabled in Google mode.
Public inputs are strict; source/status/tenant cannot bypass professional approval.
Date keys use America/Sao_Paulo, weekday 0=Monday, 30-minute starts and 15-minute
buffer. Invalid dates, starts outside 14 days or under 48 elapsed hours fail.

## Service catalog

GET services returns `{id,name,description,duration,priceMode,price,version,active}`.
Public GET includes only active entries; administrative GET includes inactive ones.
Each professional starts with the legacy discovery/consulting/review defaults and
can edit or deactivate them. IDs are scoped by the server-selected professional.

POST `/api/admin/services` creates a service with
`{name,description,duration,priceMode,priceCents,active}`. PUT
`/api/admin/services/{id}` requires the same fields plus the current `version`.
Names are trimmed, 1–100 characters; descriptions at most 500. Duration is an
optional (null/omitted), or an integer from 15 to 240 minutes, divisible by 5.
`priceMode` is `free` (cents=0), `paid` (null/omitted to agree later, or integer
cents 1–99999999) or `hidden` (cents=null). Public `price` is BRL
major units or null; hidden means omit price text, not display "free". There is no
payment processing. SQL type checks also reject fractional durations or cents,
including direct database writes. Blank paid amounts display "Valor a combinar";
blank durations display "Duração a combinar". Active is a boolean. Inputs are strict and owner IDs are not
accepted. Create returns 201; edit returns 200 and increments version. Stale or
inaccessible edits return 409. Master credentials cannot use these routes.

A service with no duration remains publishable, but cannot generate public time
slots or occupy the agenda without an agreed length. Public availability returns
[] and public POST returns 422 with an instruction to arrange directly. The UI
shows that instruction and disables self-scheduling. A professional can enter an
agreement with a concrete per-encounter duration; see below. No default duration
or free price is silently substituted.

New public and professional bookings require the displayed serviceVersion. Stale
versions return 409; inactive/foreign/missing services return 404. A database
trigger rechecks the service version and complete terms during INSERT, closing
the read/write race. Each booking stores an immutable name, description, duration,
price mode, integer cents and service version. Editing/deactivation affects new
bookings only. Existing occupancy, approval and recurring occurrences retain their
original terms. No hard-delete service endpoint exists.

## Customer capability

`GET`, `PUT`, `DELETE /api/bookings/{uuid}` require `X-Cancel-Token`, a 64-hex
random secret whose SHA-256 hash belongs to that booking. GET includes terminal
states. PUT accepts only `{date,time}` for a pending request, rechecks notice and
preserves the original deadline. Confirmed rescheduling returns 409. DELETE
cancels active requests/bookings. Inactive professionals hide their receipts.
There is no recovery link or persistent customer session; tokens stay in browser
memory. A contact value or booking ID alone grants no access.

GET `/api/bookings/{uuid}/availability?date=YYYY-MM-DD` requires the same capability
and a pending request. It returns starts using that booking's original duration,
even if its service was edited or deactivated. PUT also uses the original duration;
the public catalog cannot change the receipt or remapping duration.

Booking output: id, serviceId, serviceName, serviceDescription, serviceDuration,
servicePriceMode, servicePrice (BRL or null), serviceVersion, date, time, name, email, status,
approvalExpiresAt (epoch seconds or null), version, source (`public` or
`professional`), seriesId (UUID or null). Customer creation also returns cancelToken.
No administrative listing is public.

## Authentication

- GET `/api/auth/config`: googleEnabled/passwordEnabled booleans only.
- POST `/api/admin/google/start`: Origin + canonical host; 303 to fixed Google
  authorization endpoint, identity scopes only, short-lived state/browser cookie.
- GET `/api/admin/google/callback`: consumes state once, exchanges code/PKCE,
  validates signed ID token and professional/master authorization; rotates own
  session; redirects to `/master` or `/admin`. Failure redirects to
  `/admin?google=failed` without exposing provider details.
- POST `/api/admin/login`: strict `{password}`, demo mode only, 204 session cookie;
  wrong password 401, >5 attempts/15m 429, absent hash 503, Google mode 403.
- GET `/api/admin/session`: authenticated, role, professionalId (null for master).
- POST `/api/admin/logout`: Origin required; revokes current session, 204.

See [Google protocol](GOOGLE_AUTH.md). Session lifetime is eight hours, with
provider/subject/role/tenant validation on each protected request. Cookie path
is `/api`; legacy `/api/admin` cookies are cleared on session changes.

## Master administration

Requires an authorized Google master. The master cannot use professional booking
APIs to inspect clients. GET `/api/master/session` confirms the master role.

| Route                                     | Input / output                                                     |
| ----------------------------------------- | ------------------------------------------------------------------ |
| GET /api/master/professionals             | Nondeleted profiles, including suspended accounts                  |
| POST /api/master/professionals            | Branding + slug, invitedEmail, optional googleSubject; 201 profile |
| PUT /api/master/professionals/{id}        | Branding + current version; profile                                |
| PUT /api/master/professionals/{id}/status | `{status:active\|suspended,version}`; profile                      |
| DELETE /api/master/professionals/{id}     | `{version}`; 204; terminal removal                                 |

Branding: displayName (1–100), headerTitle (1–120), headerSubtitle (0–240),
theme (forest/navy/plum). Slugs are 3–48 lowercase alphanumeric/hyphen characters,
with alphanumeric ends; admin/master/api/demo/login are reserved. Slugs, invited
email and bound Google subject are unique, including retired accounts. Slugs
cannot change. Protected profile output includes status, invitedEmail,
googleSubject and version. Edits and first identity binding increment version.
Suspension revokes sessions and hides the page without deleting appointments.
Deletion cancels all active bookings, frees occupancy and preserves historical
rows and lifecycle events; it is not a GDPR/LGPD erasure/export endpoint.

## Professional administration

Requires the professional role. Every route below derives tenant from the session.

| Method and route                                   | Contract                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| GET /api/admin/profile                             | Own protected profile                                                                                   |
| PUT /api/admin/profile                             | Own branding + version; identity/slug/status edits rejected                                             |
| GET /api/admin/services                            | Own catalog including inactive services                                                                                   |
| GET /api/admin/bookings                            | Own full history, sorted by date/time                                                                   |
| GET /api/admin/hours                               | Enabled weekdays as `{weekday,opens,closes}`                                                            |
| PUT /api/admin/hours                               | `{weekdays:[0…6],opens,closes}`; atomic seven-day update; conflicts with future reservations return 409 |
| POST /api/admin/bookings/{uuid}/approve or /reject | `{version}`; decision before 24h deadline, tenant checked                                               |
| DELETE /api/admin/bookings/{uuid}                  | Cancel one active occurrence/booking, 204                                                               |
| POST /api/admin/series                             | Explicit agreed single or finite recurring appointments, described below                                |
| DELETE /api/admin/series/{uuid}?scope=all            | Explicitly cancel every future confirmed encounter of the owned series; preserve past; 204 |
| DELETE /api/admin/series/{uuid}?fromBookingId={uuid} | Compatibility: cancel selected/later future encounters; preserve earlier; 204 |

Series input: `{requestId,serviceId,serviceVersion,date,time,name,email,frequency,count}`.
For a service with null duration, input also requires `duration` (integer 15–240,
divisible by 5) for this encounter or every occurrence in this finite series.
For a fixed-duration service, a duration override is rejected (422). Catalog duration
remains null; each created booking snapshots the actual agreed duration. Paid
amount may remain null in both public and professional booking snapshots.

requestId is a caller-generated UUID for deduplication; frequency is once, weekly
or fortnightly; count 1–26 (once requires 1). Email may be empty. Starts are in
the future, within 366 calendar days; same local HH:mm every 7 or 14 days. The
professional explicitly confirms a prior agreement, so 48h public notice and the
24h approval deadline do not apply. Hours, duration, buffer, tenant ownership and
occupancy constraints still apply to every occurrence. No infinite generation,
public recurrence, automatic renewal or email/Calendar delivery.

201 returns `{id,bookings:[...]}`. A single D1 batch creates the series, all
confirmed occurrences, occupancy and confirmation audit/outbox. Any conflict
rolls back all of them. Repeating requestId with identical data returns the same
result, including concurrent retries; changed data returns 409. No cancel token
is exposed for professional-entered occurrences. Editing a series or moving a
confirmed occurrence is pending; cancel and explicitly recreate instead.

## State, maintenance and limitations

Public requests can become confirmed/rejected/expired/cancelled; confirmed can
be cancelled; terminal states cannot reopen. Every update increments version.
Approve/reject replay succeeds only for matching status and submitted+1 stored
version. Deadline equality means expired. Every five minutes and before agenda
requests, expiration releases occupancy atomically. Preview Cron execution is
not presumed; request-time cleanup still applies.

GET `/api/health` probes approval, identity, tenancy and recurrence schema; 200
`{status:ok,storage:D1,approvalWorkflow:true}` or 503. It does not certify Google,
mail, Calendar or backup availability. Outbox state awaiting_integration means
no external delivery. Follow [rollout](HUMAN_VALIDATION.md); migrations must not
run against an old writable Worker or the old shared Preview.

## Google callback failure diagnostics

GET /api/admin/google/callback returns a 303 failure redirect to
/admin?google=failed&reason=STAGE, with Cache-Control: no-store, no-referrer and
OAuth transaction cookie deletion. STAGE is a fixed server classification:
configuration, origin, transaction, exchange, identity, authorization or session.
Token endpoint errors additionally allow exchange_invalid_client,
exchange_invalid_grant, exchange_unauthorized_client,
exchange_redirect_uri_mismatch, exchange_invalid_request and exchange_unavailable.
Only exact allowlisted codes are recognized; arbitrary descriptions and unknown
provider values fall back to exchange. Network failure, HTTP 429 or unclassified
HTTP 5xx maps to exchange_unavailable.
Unclassified failures use internal. Raw provider bodies, JWTs, query parameters,
account identifiers, exception messages and SQL details are never reflected.
The login UI maps known stages to Portuguese guidance and uses a generic fallback.
Authorization is reported only after cryptographic identity verification; no
specific subject, invitation or master membership is disclosed. No checks are
bypassed and failures create no authenticated session.

The native Worker token transport now preserves global fetch's receiver. Request,
callback, credential and authorization contracts are unchanged; this fixes a
pre-network runtime exception previously classified as exchange_unavailable.

## Explicit series cancellation scope

The UI's "Cancelar só esta" uses DELETE /api/admin/bookings/{bookingId}; it affects
only that owned occurrence. "Cancelar todas da série" uses DELETE
/api/admin/series/{seriesId}?scope=all and cancels all future confirmed encounters
of that owned series, including dates preceding the clicked row. Past encounters,
already cancelled rows, other series and other professionals are preserved.
Both UI actions require confirmation; dismissing sends no mutation.

The preceding fromBookingId={uuid} cutoff remains supported for compatible clients,
but the UI no longer offers that third choice. The server derives its cutoff from
an occurrence owned by the same series/professional, never a caller-provided date.
A request must contain exactly one scope=all with no anchor, or exactly one valid
fromBookingId with no scope. Missing/unknown/duplicate/mixed selectors return 422
without mutations. Missing/foreign series or mismatched anchors return 404.
Bare DELETE never implicitly means "cancel all"; older clients must reload.

Cancellation and series status update run in a transactional D1 batch. Existing
triggers release occupancy and record transitions/outbox. Repeated requests return
204 without new booking versions or repeated transition events. Series status
remains active while any future confirmed encounter remains, otherwise cancelled.
No migration or automatic restoration of previously cancelled appointments occurs.
