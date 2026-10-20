# API contract

Source of truth: `worker/index.ts`, `worker/booking.ts`, `worker/security.ts` and
`migrations/0001_initial.sql`. Paths below are relative to the same origin.
Responses use JSON except for HTTP 204. Errors use `{ "detail": "message" }`.
API responses have `Cache-Control: no-store`.

| Method | Path | Access | Success |
| --- | --- | --- | --- |
| GET | `/api/services` | Public | 200, service array |
| GET | `/api/calendar` | Public | 200, today/timezone/horizonDays |
| GET | `/api/health` | Public | 200, status/storage; checks a schema query |
| GET | `/api/availability?date=YYYY-MM-DD&serviceId=discovery` | Public | 200, array of HH:mm strings |
| POST | `/api/bookings` | Public | 201, booking plus cancelToken |
| PUT | `/api/bookings/:id` | X-Cancel-Token | 200, updated booking plus cancelToken |
| DELETE | `/api/bookings/:id` | X-Cancel-Token | 204 |
| POST | `/api/admin/login` | Same-origin Origin header | 204, session cookie |
| POST | `/api/admin/logout` | Same-origin Origin header | 204, revokes supplied session and clears cookie; idempotent without a valid session |
| GET | `/api/admin/session` | Session cookie | 200, authenticated: true |
| GET | `/api/admin/bookings` | Session cookie | 200, all uncancelled bookings, including past bookings |
| GET | `/api/admin/hours` | Session cookie | 200, enabled weekdays and hours |
| PUT | `/api/admin/hours` | Session cookie and same-origin Origin | 200, enabled weekdays and hours |
| DELETE | `/api/admin/bookings/:id` | Session cookie and same-origin Origin | 204 |

## Payloads and rules

- Create: `{ serviceId, date, time, name, email }`. Services are `discovery`
  (30 minutes), `consulting` (60), and `review` (45).
- Reschedule: `{ date, time }`; service and contact stay unchanged.
- Login: `{ password }`.
- Hours: `{ weekdays, opens, closes }`, with unique weekday integers from 0
  (Monday) through 6 (Sunday), at least one day, and a shared opening/closing
  interval on half-hour boundaries. API closing time is at most 23:30 even though
  the database permits 24:00.
- Booking output: `{ id, serviceId, date, time, name, email }`.
- Dates run from tomorrow through 14 days ahead in America/Sao_Paulo. Starts
  use half-hour boundaries; service plus a 15-minute buffer must fit the hours.
  The timestamp calculation currently uses a fixed UTC-03:00 offset.
- Customer operations need the 64-character hexadecimal token returned at
  creation in the `X-Cancel-Token` header. The UI retains it only in memory;
  reload/navigation loses customer self-service. No recovery or email is sent.

## Errors and boundaries

| Status | Meaning |
| --- | --- |
| 401 | Invalid credentials or missing/expired administrative session |
| 403 | Missing or different Origin on login/administrative writes |
| 404 | Unknown route, booking, malformed ID or invalid customer token |
| 409 | Occupied interval or hours change invalidating future bookings |
| 413 | Request body exceeds the current 8192 length checks |
| 422 | Invalid payload, date, service or opening hours |
| 429 | Login attempt limit reached |
| 503 | Storage/configuration failure or unhandled server failure |

Missing/malformed admin password configuration blocks new logins, not existing
sessions. Sessions expire after eight hours; logout revokes the supplied token.
Public booking creation currently has no dedicated anti-abuse limit. Database
triggers enforce overlap and opening hours; date horizon and contact validation
are API checks, not equivalent database guarantees. Health does not validate
admin secrets, all migrations, backups or booking writes.

## Evidence

`worker-tests/api.test.ts` covers Worker/D1 concurrency, rollback, tokens, sessions,
Origin, schedule protection, failed login throttling and selected validation
cases. `e2e/booking.spec.ts` covers the browser journey and limited accessibility
scans described in the README. Test presence is not proof of a successful run;
use the CI result for the exact commit. Production validation is separate.
