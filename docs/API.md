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
| GET /services                                  | Fixed discovery (30), consulting (60), review (45 minutes) catalog                         |
| GET /calendar                                  | today, timezone, horizonDays=14, minimumNoticeHours=48, approvalWindowHours=24             |
| GET /availability?date=YYYY-MM-DD&serviceId=…  | Free HH:mm starts; tenant hours, active holds and 48h notice applied                       |
| POST /bookings                                 | `{serviceId,date,time,name,email}`; 201 pending receipt plus one-time returned cancelToken |

The unscoped equivalents `/api/services`, `/api/calendar`, `/api/availability`
and POST `/api/bookings` are demo compatibility routes, disabled in Google mode.
Public inputs are strict; source/status/tenant cannot bypass professional approval.
Date keys use America/Sao_Paulo, weekday 0=Monday, 30-minute starts and 15-minute
buffer. Invalid dates, starts outside 14 days or under 48 elapsed hours fail.

## Customer capability

`GET`, `PUT`, `DELETE /api/bookings/{uuid}` require `X-Cancel-Token`, a 64-hex
random secret whose SHA-256 hash belongs to that booking. GET includes terminal
states. PUT accepts only `{date,time}` for a pending request, rechecks notice and
preserves the original deadline. Confirmed rescheduling returns 409. DELETE
cancels active requests/bookings. Inactive professionals hide their receipts.
There is no recovery link or persistent customer session; tokens stay in browser
memory. A contact value or booking ID alone grants no access.

Booking output: id, serviceId, date, time, name, email, status,
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
| GET /api/admin/services                            | Fixed service catalog                                                                                   |
| GET /api/admin/bookings                            | Own full history, sorted by date/time                                                                   |
| GET /api/admin/hours                               | Enabled weekdays as `{weekday,opens,closes}`                                                            |
| PUT /api/admin/hours                               | `{weekdays:[0…6],opens,closes}`; atomic seven-day update; conflicts with future reservations return 409 |
| POST /api/admin/bookings/{uuid}/approve or /reject | `{version}`; decision before 24h deadline, tenant checked                                               |
| DELETE /api/admin/bookings/{uuid}                  | Cancel one active occurrence/booking, 204                                                               |
| POST /api/admin/series                             | Explicit agreed single or finite recurring appointments, described below                                |
| DELETE /api/admin/series/{uuid}                    | Cancel all future confirmed occurrences, preserve past; repeated call safe; 204                         |

Series input: `{requestId,serviceId,date,time,name,email,frequency,count}`.
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
