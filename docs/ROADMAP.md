# Roadmap

Slotiva is being developed for independent appointment-based professionals.
The first workflows cover public requests and fixed weekly or fortnightly
appointments entered by the professional.

## Next

- Resolve and validate the Google Calendar connection in Preview.
- Check external availability before confirmation.
- Create linked Calendar events without duplicates on retry.
- Propagate cancellations and send invitations after event creation.
- Deliver transactional emails and let customers recover access after reload.

Slotiva will remain the source of truth for bookings. External delivery failures
need a visible retry state separate from booking status. Confirmed rescheduling
should keep the original appointment until a replacement is approved.

## Later

- Date-specific working-hour exceptions.
- Editing recurring agreements.
- Client records with verified contacts and explicit handling of shared addresses.
- Retention, export and deletion workflows.

Payments, clinical notes and WhatsApp are outside the current scope.

## Before a customer pilot

Validate real consent, Calendar revocation/reconnection, event retries,
invitation delivery and customer recovery. Agree services and cancellation
policies with the professional. Test a database restore, define support and
monitoring, and check keyboard/mobile access with fictional bookings.
