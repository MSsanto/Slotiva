# Slotiva API — 0.5.0

Same-origin `/api`; JSON, no-store. Invalid payloads: 422; missing sessions: 401;
wrong role/origin: 403; unknown/inaccessible resource: 404; overlap, stale version
or reused conflicting operation: 409; unconfigured/unavailable storage: 503.
Admin/master mutations require an exact Origin and an HttpOnly session cookie.
No caller-provided professional ID chooses the authenticated tenant.

## Public professional page

`GET /api/public/{slug}/profile` returns id, slug, displayName, headerTitle,
headerSubtitle, theme and whatsappNumber (null when hidden). It never exposes email, Google subject or version.
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

See [Google protocol](ARCHITECTURE.md#authentication). Session lifetime is eight hours, with
provider/subject/role/tenant validation on each protected request. Cookie path
is `/api`; legacy `/api/admin` cookies are cleared on session changes.

## Master administration

Requires an authorized Google master. The master cannot use professional booking
APIs to inspect clients. GET `/api/master/session` confirms the master role.

| Route                                     | Input / output                                                     |
| ----------------------------------------- | ------------------------------------------------------------------ |
| GET /api/master/professionals             | Active/suspended profiles; ?status=deleted lists deleted profiles                  |
| POST /api/master/professionals            | Branding + slug, invitedEmail, optional googleSubject; 201 profile |
| PUT /api/master/professionals/{id}        | Branding + current version; profile                                |
| PUT /api/master/professionals/{id}/status | `{status:active\|suspended,version}`; profile                      |
| DELETE /api/master/professionals/{id}     | `{version}`; 204; recoverable removal                                 |

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
public recurrence or automatic renewal. Calendar delivery requires separate write consent.

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
no external delivery. Follow [rollout](OPERATIONS.md); migrations must not
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


## Separate Google Calendar connection and event synchronization

All routes require an active Google professional session; master/demo credentials
cannot access them. Mutations require the exact Origin. Scope is server-selected
primary calendar of that same account; no caller-supplied owner/calendar IDs.

| Method and route | Contract |
| --- | --- |
| GET /api/admin/calendar | `{enabled,state,connectedAt,mode:"availability_only"|"event_sync"}`; state disconnected, connected or reconnect_required; no credentials |
| POST /api/admin/calendar/start | 303 to separate Google free/busy and owned-event consent; session-bound ten-minute state + PKCE + nonce; disabled configuration returns 503 |
| GET /api/admin/calendar/callback | One-use exchange and signed identity match; redirects to /admin?calendar=connected or failed; never provider details |
| DELETE /api/admin/calendar | 204; deletes own local credentials and pending consent; does not revoke Google's shared grant |
| GET /api/admin/calendar/busy?date=YYYY-MM-DD | Today through +14 days; `{date,timezone,busy:[{start,end}]}`; intervals only from primary calendar |
| GET /api/admin/calendar/sync | Own jobs only: `[{id,date,start_min,state,last_error}]`; up to 200 entries; no credentials or customer contacts |
| POST /api/admin/calendar/sync | Same-origin professional only; retries up to three due jobs and returns the same status list |

Invalid dates are 422; absent/revoked connection is 409; provider/key failures are
503 and never imply free time. Invalid refresh grants mark reconnect_required.
Suspension/removal/identity change deletes credentials.

Job states are pending, synced, skipped (unsent meeting already started), failed
or conflict. Errors use fixed codes provider, conflict, connection or event_changed.
A synced cancellation means Google reports the event absent/cancelled; a synced
confirmation means the linked event exists. Google notification delivery to the
recipient is not separately acknowledged. The older notification outbox is not
consumed for standalone email. Approval and professional series creation query
Google availability when write access is connected. Conflicts return 409; provider
failure returns 503. Public availability excludes Google busy intervals too.
See [Calendar connection](CALENDAR_CONNECTION.md) for encryption, races, setup and limitations.

## Calendar callback diagnostics

The Calendar callback redirects to `/admin?calendar=connected` on success or
`/admin?calendar=failed&calendar_reason=CODE` on failure. Both responses use
`Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

Codes are configuration, transaction, consent, exchange, exchange_invalid_client,
exchange_invalid_grant, exchange_unauthorized_client,
exchange_redirect_uri_mismatch, grant, scope, identity, account, encryption,
storage, session or internal. Provider mappings accept only exact allowlisted
codes on HTTP 400/401; other exchange failures use exchange. Unknown UI codes
use generic guidance. Provider bodies, tokens and exception messages are omitted.

## Professional WhatsApp contact

PUT `/api/admin/whatsapp` accepts
`{whatsappNumber:string|null,whatsappEnabled:boolean,version:number}` and returns
the updated private profile. It requires the professional session and exact Origin;
ownership comes from the session. Master credentials and owner IDs in the payload
are rejected. Stale versions return 409 and invalid contact data returns 422.

The number is optional when hidden, required when enabled, and normalized to
8–15 international-format digits, starting with 1–9. A leading +, spaces,
parentheses and hyphens are accepted; blank clears the stored number. Private
profile responses include the saved number and whatsappEnabled. Public profiles
return only the enabled number, or null; a disabled saved number is not disclosed.
Suspended/deleted professional pages remain unavailable.

The public page and customer receipt build a fixed wa.me link with a neutral
message and no customer/booking data. Contact does not mutate booking status.
Migration 0009 adds the contact fields; existing professionals start with it hidden.

## Restore a deleted professional

GET `/api/master/professionals?status=deleted` lists deleted profiles for the
authenticated master. Default listing still excludes them; other status filters
return 422.

POST `/api/master/professionals/{id}/restore` requires the master session,
exact Origin and `{version}`. It returns 200 with the original profile active
and its version incremented. Nondeleted, missing or stale profiles return 409.
The normal status endpoint cannot restore a deleted account.

Restoration preserves ID, slug, invited email, Google subject, branding, services
and working hours. It does not revive cancelled bookings, expired sessions or
deleted Calendar grants. WhatsApp publication is disabled until the professional
explicitly enables it again. The professional must sign in again and reconnect
Calendar. A restored audit event records the master actor and new version.
Identifiers remain unique; this restores the original account rather than freeing
its identifiers for a different person. Physical deletion remains blocked.
Migration 0010 replaces the lifecycle guard and audit triggers.

Calendar exchange diagnostics also include exchange_invalid_request,
exchange_invalid_scope, exchange_unsupported_grant_type, exchange_unavailable
and exchange_redirect_blocked. Failed HTTP exchanges append calendar_http
(300–599); arbitrary query values are not displayed. Network failures have no
provider HTTP status. Redirects are returned manually and rejected rather than
followed, including refresh and free/busy requests.

## Customer browser access and date exceptions

New public booking responses set `slotiva_customer` with HttpOnly, SameSite=Lax,
Secure outside local development, Path=/api and a 30-day lifetime. D1 grants scope
that opaque session to individual bookings. Existing X-Cancel-Token access remains
supported. Cookie-authorized mutations require the exact Origin.

| Route | Contract |
| --- | --- |
| GET /api/customer/bookings?slug=SLUG | Accessible bookings for that professional; no capability tokens; empty when no valid grants |
| DELETE /api/customer/session | Same-origin; revoke all current browser grants and clear cookie |
| POST /api/bookings/:id/access | Authorized customer, same-origin; returns a one-use fragment URL and expiresIn=1800 |
| POST /api/customer/access | Same-origin `{token}`; atomically redeem a live link, set cookie, return bookingId; expired/replayed links return 404 |
| GET /api/admin/date-hours | Own future date exceptions |
| PUT /api/admin/date-hours | `{date,opens,closes,enabled,version}`; version 0 creates, otherwise guarded update |
| DELETE /api/admin/date-hours | `{date,version}`; restore weekly hours only when existing bookings still fit |

Date exceptions replace weekly hours for that date, including closed dates and
normally closed weekdays. SQL guards apply to public requests, professional series
and booking updates. A conflicting exception returns 409 and preserves existing
reservations. Public slot selection now excludes Google busy intervals, including
the Slotiva buffer. Provider failure never implies an available external interval.

## Confirmed appointment changes

`POST /api/bookings/:id/change` takes `{date,time}` with customer authorization and
exact Origin. Only future confirmed bookings accept proposals. The proposed time
must meet public notice/window rules. It is not held while awaiting approval;
the current booking remains confirmed. One pending proposal per booking is allowed.
`GET` on the same route returns the latest proposal, without contact details.

`GET /api/admin/booking-changes` lists own pending proposals. Professionals decide
through `POST /api/admin/booking-changes/:id/approve` or `/reject` with `{version}`.
An approval checks Google availability and atomically cancels the original,
creates a confirmed one-off replacement with the same immutable service terms,
and transfers current browser grants. The old capability also authorizes the
replacement. Outbox and Calendar jobs follow both transitions. A conflicting slot or stale original version rolls back all changes. Explicit
replacements preserve agreed terms even if the catalogue has changed. Repeating the
same decision/version returns the committed result. Cancellation of the original
cancels a pending proposal. Proposals expire after 24 hours; they cannot be approved
once the original or proposed meeting has started. A confirmed recurring occurrence
is replaced individually; the other occurrences remain unchanged.

## Transactional email and recovery

Email requires explicit EMAIL_ENABLED=true, a verified EMAIL_FROM, Resend
EMAIL_API_KEY, independent 32-byte base64 EMAIL_TOKEN_KEY and PUBLIC_ORIGIN.
`GET /api/customer/delivery` reports only whether it is configured.
`POST /api/customer/recovery` takes `{bookingId,email,slug}` and exact Origin.
It always returns the same 202 response for valid input, whether the booking
matches or not. Limits are five attempts per IP/hour and three matching recovery
requests per booking/hour. Disabled configuration returns 503, not a false send.

Matching recovery creates an encrypted email job and a hashed, single-use link
valid for 30 minutes. Mailbox proof is recorded per booking when an emailed link
is redeemed. Manually generated device links do not verify contact ownership.
Shared addresses never merge reservations or client identities automatically.

`GET /api/admin/delivery` lists own last 100 jobs without recipient addresses or
mail bodies. `POST /api/admin/delivery/retry` retries own failed, unexpired jobs.
New booking/status triggers queue messages; older history is not backfilled.
Consumers process three jobs per pass, use leases and stable Resend idempotency
keys, freeze encrypted request bodies before network I/O and clear them after
acceptance or expiry. Retries stop within 23 hours, inside Resend's 24-hour key
window. Obsolete status messages expire instead of reporting stale states.
Recovery jobs expire after 30 minutes. Accepted means the provider accepted the
request, not confirmed inbox delivery. Google invitations remain separate.

## Client records and privacy review

Migration 0016 creates separate client records for public requests; professional
series share their explicit series identity. Equal names/addresses never merge
records. A changed appointment inherits the original client association.
`GET /api/admin/clients?q=TEXT&archived=false` returns at most 200 own records,
counts, shared-email flags and mailbox-proof timestamps. A proof is valid only for
the current contact email and a linked booking that redeemed an emailed link.
It does not identify a unique person or authorize other appointments.

Create/update use `POST /api/admin/clients` and `PUT /api/admin/clients/:id` with
`{name,email,phone,archived,version}`. Version 0 creates. Phone is optional E.164-style
text and is never labelled verified. Updates do not rewrite booking snapshots.
`DELETE` with `{version}` removes only a record with no linked history; otherwise
409 directs the professional to archive. Archive does not cancel appointments.

`GET /api/admin/client-links` returns own versioned booking associations.
`POST /api/admin/clients/:id/assign` takes `{bookingId,version}` and checks both
owners and the existing link version. It changes the professional's association,
not customer access grants. `GET /api/admin/clients/:id/export` returns the own
record and linked booking outputs, never capabilities or encrypted credentials.

Authorized customers export only the named booking with `GET /api/bookings/:id/export`.
`POST /api/bookings/:id/privacy` accepts `{kind:"export"|"delete"}` and exact Origin;
one open request per booking/kind is recorded. It does not cancel or erase records.
Professionals review own requests through GET /api/admin/privacy and guarded
PUT /api/admin/privacy/:id `{state:"reviewing"|"closed",version}`. These states
track human review, not proof of deletion. Define the professional's retention
policy and external-provider erasure procedure before real customer operation.


## Editing recurring agreements and Calendar review

GET /api/admin/series lists own active weekly/fortnightly agreements with their
confirmed future booking versions. PUT /api/admin/series/:id takes
{date,time,frequency,count,requestId,versions:[{id,version}]} and exact Origin.
It replaces only confirmed future occurrences in one D1 batch. Conflicts or stale
booking/client associations roll back the whole change. Repeating the same request
returns its committed result. Mixed contacts/terms require individual handling.

Migration 0017 records explicit replacement lineage. Agreed immutable service terms
are preserved even when the catalogue changes; this exception does not allow new
public requests to select obsolete prices. Old grants transfer only by occurrence
index; newly added occurrences do not inherit another booking's access merely
because the email matches. The existing client identity is retained without
creating an unused duplicate. History stays unchanged.

POST /api/admin/calendar/reconcile queues own future synced confirmations for
review. Externally moved/deleted events become visible errors; the worker does not
silently recreate deleted events. A local cancellation accepts an already-deleted
tombstone as complete. Replacement availability ignores only the exact deterministic
event ID with matching private booking metadata, never unrelated collisions.
Event listing is bounded to four pages of 2500 resources and fails closed on
malformed responses or additional pages. All-day events use conservative global-day
bounds when their calendar timezone is absent, which may require manual review.
Google edits are reviewed, not automatically imported as confirmed patient changes.
