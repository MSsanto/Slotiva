# Roadmap

## Demo readiness — first

- Customer reload continuity and one-use cross-device links are implemented;
  validate the 30-day cookie and 30-minute link in Preview. Revocation, expiry and
  booking/tenant isolation have automated coverage.
- Isolated local demo, fictional seed and guarded reset are implemented. CI
  verifies startup and captures the public page; real appointments stay separate.
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
- Client records, explicit associations and per-booking mailbox proof are
  implemented. Shared addresses remain separate; validate with fictional clients.
- Scoped export, archive and deletion-request review are implemented. Agree
  retention and external-provider erasure with the professional before enabling
  any automatic historical-data deletion.

## Implemented — awaiting Preview rollout

- Agenda views for today, future appointments, cancellations and earlier history,
  using Brasília dates. No migration; check date rollover and keyboard navigation.

- Master restoration of deleted professional profiles, preserving original
  identity and cancelled history. Apply migration 0010 and validate restoration.

- Optional professional WhatsApp contact, with an explicit visibility toggle,
  neutral message and no booking/customer data in the link. Apply migration 0009
  and check the published Preview before marking rollout complete.

## Portfolio presentation

- README includes an architecture diagram and a real screenshot of the isolated
  fictional demo, captured and verified in CI.
- The original logo and a transparent symbol are integrated into the home page,
  header, favicon and mobile manifest. Validate appearance on pilot devices.

## Before a customer pilot

Validate real consent, Calendar revocation/reconnection, event retries,
invitation delivery and customer recovery. Agree services and cancellation
policies with the professional. Test a database restore, define support and
monitoring, and check keyboard/mobile access with fictional bookings.

Payments, clinical notes and automated WhatsApp messaging are outside the current
scope. The optional WhatsApp contact link is implemented separately.
