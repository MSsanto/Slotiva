# Roadmap

## Demo readiness — first

- Preserve customer access to the booking after a page reload.
  Prefer a server-side booking-scoped session with an HttpOnly cookie, expiry
  and revocation; review the design before implementation.
  Acceptance: create a booking, reload, read its current status and cancel it;
  an expired or foreign session must not grant access to another booking.
- Prepare an isolated demo with fictional professionals, services and working
  hours, plus a repeatable reset. Keep demo data separate from real appointments.
- Verify the complete request → professional approval → customer status →
  cancellation flow, including reload and released availability.

## Calendar and delivery

- Resolve and validate the Google Calendar connection in Preview.
- Check external availability before confirmation.
- Create linked Calendar events without duplicates on retry.
- Propagate cancellations and send invitations after event creation.
- Deliver transactional emails and recover customer access on a new browser/device.

Slotiva remains the source of truth for bookings. External delivery failures need
a visible retry state separate from booking status. Customer access across devices
is separate from preserving the current browser session after reload.

## Product improvements

- Propose changes to confirmed appointments while retaining the original time
  until the professional approves the replacement.
- Date-specific working-hour exceptions.
- Editing recurring agreements.
- Client records with verified contacts and explicit handling of shared addresses.
- Retention, export and deletion workflows.

## Implemented — awaiting Preview rollout

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
