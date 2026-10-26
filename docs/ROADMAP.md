# Roadmap

## Demo readiness — first

- Customer reload continuity and one-use cross-device links are implemented;
  validate the 30-day cookie and 30-minute link in Preview. Revocation, expiry and
  booking/tenant isolation have automated coverage.
- Prepare an isolated demo with fictional professionals, services and working
  hours, plus a repeatable reset. Keep demo data separate from real appointments.
- Verify the complete request → professional approval → customer status →
  cancellation flow, including reload and released availability.

## Calendar and delivery

- Event creation, invitations and cancellation were accepted with a real Google
  account in Preview. Validate revocation/reconnect, outage recovery and conflict
  handling against Google; synthetic-provider tests already cover these cases.
- Public slot selection now excludes Google busy intervals; validate live provider
  errors and reconnect behavior in Preview.
- Reconcile edits made directly in Google; reservations currently change in Slotiva.
- Transactional email and booking-reference recovery are implemented behind
  explicit sender configuration. Configure and validate a real sender in Preview.

Slotiva remains the source of truth for bookings. External delivery failures need
a visible retry state separate from booking status. Customer access across devices
is separate from preserving the current browser session after reload.

## Product improvements

- Confirmed appointment change proposals are implemented with atomic replacement;
  validate the approval/rejection and Google cancellation/new-event flow in Preview.
- Date-specific working-hour exceptions are implemented; validate closures and
  additional opening days in Preview.
- Editing recurring agreements.
- Client records with verified contacts and explicit handling of shared addresses.
- Retention, export and deletion workflows.

## Implemented — awaiting Preview rollout

- Agenda views for today, future appointments, cancellations and earlier history,
  using Brasília dates. No migration; check date rollover and keyboard navigation.

- Master restoration of deleted professional profiles, preserving original
  identity and cancelled history. Apply migration 0010 and validate restoration.

- Optional professional WhatsApp contact, with an explicit visibility toggle,
  neutral message and no booking/customer data in the link. Apply migration 0009
  and check the published Preview before marking rollout complete.

## Portfolio presentation

- Add a concise architecture diagram and a representative demo screenshot to
  the README; keep it readable in two minutes.
- Integrate the approved logo variants, favicon and mobile icon.

## Before a customer pilot

Validate real consent, Calendar revocation/reconnection, event retries,
invitation delivery and customer recovery. Agree services and cancellation
policies with the professional. Test a database restore, define support and
monitoring, and check keyboard/mobile access with fictional bookings.

Payments, clinical notes and automated WhatsApp messaging are outside the current
scope. The optional WhatsApp contact link is implemented separately.
