# Roadmap

The current main branch is a single-professional booking demo. Product work is
under development in `feat/product-readiness`.

## Scheduling product

- Google sign-in and separate master/professional roles.
- Individual public pages, service catalogs and agendas.
- Public requests with 48-hour notice and professional approval within 24 hours.
- Direct entry of agreed weekly or fortnightly appointments.
- Separate Calendar authorization, external availability checks and linked events.
- Invitations after confirmation, email delivery and customer access recovery.

Slotiva will own booking state. External delivery needs idempotent retries and
visible failure states. Contact details alone must not grant access to bookings.

## Before a pilot

Validate professional isolation, concurrent bookings, deadlines, Calendar consent
and revocation, delivery retries and customer recovery. Agree service and
cancellation policies, test a database restore and check keyboard/mobile access.

Payments, clinical notes and WhatsApp are outside the current scope.
