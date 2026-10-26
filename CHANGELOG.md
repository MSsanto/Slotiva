# Changelog

## Unreleased

- Isolated local demo with fictional appointments, a repeatable guarded reset,
  disabled external delivery and a dedicated local D1 configuration.
- Backup/restore drill verifies SQLite integrity, foreign keys, schema and row
  counts without changing the source. Adds a timeout-bounded health checker.
- README architecture diagram and a reproducible fictional screenshot capture;
  CI validates demo startup, restore and capture.

- Optional transactional email and booking-reference recovery through Resend.
  Encrypted queues, bounded retries, stable idempotency keys, generic recovery
  responses and one-use links keep delivery separate from booking status.
- Email ownership proof is recorded per booking only after redemption of an
  emailed link. Device-transfer links do not verify contacts or merge addresses.
- Requires migration 0015, a verified sender and separate email secrets before
  real delivery can be validated; Google invitations continue independently.

- Customers can propose a new time for a confirmed appointment. The current
  reservation remains confirmed until professional approval atomically creates
  its replacement, cancels the original and transfers customer access. Conflicts
  roll back the complete operation; rejected proposals preserve the original.

- Customer access survives reload with a 30-day HttpOnly, booking-scoped cookie.
  Customers can revoke browser access or generate a 30-minute, one-use link to
  continue on another device. No capability is stored in localStorage.
- Public availability excludes occupied Google intervals and fails closed when
  the connected provider is unavailable.
- Date-specific working hours support closures and additional opening dates,
  with SQL constraints preserving existing reservations.

- Adds month selection to Futuros, with a monthly count and the total across
  future months. The initial month contains the next reservation.
- Preview acceptance confirmed Google event creation, recipient invitations and
  cancellation delivery with a real account.

### Calendar event synchronization

- Explicit owned-event consent; existing read-only connections require reauthorization.
- Durable, bounded Calendar delivery for future confirmations and cancellations,
  stable event IDs, retries, lease/version guards and visible per-booking status.
- Private neutral events request Google invitations for the supplied attendee email.
- Check Google conflicts before approval and professional series creation.
- Migration 0011 backfills future confirmed reservations. Remote migrations,
  publication and real Google invitation/cancellation acceptance remain release steps.

- Splits the professional agenda into Hoje, Futuros, Cancelados and Histórico.
  Uses Brasília dates, updates at midnight and keeps past/cancelled rows read-only.

- Fixes Calendar transport failing before network I/O: workerd requires manual
  redirects instead of the unsupported error mode. Unexpected redirects are rejected.
- Distinguishes provider request/scope errors, outages and HTTP status in safe
  Calendar diagnostics, with native workerd regression coverage.

- Adds deleted-profile listing and restoration for the master. Original identity
  and history are retained; cancelled bookings and revoked sessions stay unchanged.
- Adds migration 0010 for restoration lifecycle guards and audit events.
- Resets the creation form after success and places creation errors by the submit button.

- Adds optional professional WhatsApp contact settings and a public contact link
  on booking pages and receipts. Hidden by default; uses a neutral message.
- Adds migration 0009 for per-professional contact number and visibility.

- Simplified project documentation and contribution guidance.
- Consolidated architecture and operations notes; kept historical development
  notes in Git history.
- Replaced mandatory document-touch rules with a Markdown link check.

## 0.5.0 — In development

- Google sign-in with separate master and professional roles.
- Professional invitations, public pages, editable branding and working hours.
- Professional-owned service catalogs with optional duration and paid amount.
- Booking snapshots preserve agreed terms after catalog edits.
- Finite single, weekly and fortnightly appointments entered by professionals.
- Explicit cancellation of one occurrence or all future encounters in a series.
- Separate agenda and cancelled-history views.
- Separate read-only Calendar consent, encrypted refresh credentials and manual
  primary-calendar availability lookup.
- Login and Calendar callback diagnostics; native Worker fetch transport fix.

Calendar consent is still being validated in Preview. Automatic external conflict
checks, Calendar events, invitations and transactional delivery are pending.

### Database changes

| Migration | Change |
| --- | --- |
| 0003 | Google identity and sessions |
| 0004 | Professional ownership and public pages |
| 0005 | Finite agreed series |
| 0006 | Service catalogs and booking snapshots |
| 0007 | Optional catalog duration and paid amount |
| 0008 | Calendar connections and consent transactions |

Migrations 0006–0007 rebuild booking tables and require a coordinated deployment.

## 0.4.0 — Approval workflow

- Public requests require 48-hour notice and professional approval within 24 hours.
- Expired, rejected and cancelled requests release held time.
- Version checks protect decisions and pending edits.

Earlier implementation details and validation runs remain in commit and CI history.
