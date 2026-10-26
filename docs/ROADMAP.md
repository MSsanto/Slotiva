# Roadmap

## Implemented in product-readiness

- Google event creation, recipient invitations and cancellation were accepted
  with a real account. Agenda tabs and monthly future filtering were also accepted.
- Customer access survives reload with a 30-day HttpOnly booking-scoped session.
  A hashed, single-use 30-minute link transfers access to another device.
- Public availability excludes Google busy intervals. Date-specific hours allow
  closures or extra opening dates without invalidating existing reservations.
- Customers can propose changes to confirmed appointments. Professional approval
  atomically replaces the reservation; conflicts preserve the original.
- Optional transactional email and booking-reference recovery use encrypted
  queues, bounded retries and provider idempotency. Sending requires configuration.
- Client records keep shared addresses separate, derive mailbox proof from emailed
  links, support explicit booking associations and export scoped data. Archive
  preserves history; deletion requests enter professional review.
- A local-only fictional demo has a guarded reset, repeatable backup/restore drill
  and health checker. CI verifies startup, restore, mobile access and capture.
- README includes the architecture and an actual fictional-demo screenshot.
  The approved logo, transparent symbol, favicon and mobile manifest are integrated.

These new implementations require Preview rollout and acceptance; automated
coverage does not establish real-provider delivery or an agreed retention policy.

## Remaining implementation

- Edit finite recurring agreements, replacing only future occurrences atomically
  while preserving history, service snapshots and scoped customer access.
- Reconcile direct Google edits/deletions through a visible review flow without
  silently overwriting external changes.

Both items are tracked in [issue #20](https://github.com/MSsanto/Slotiva/issues/20).
An interrupted local prototype is not part of the release; migration 0017 is not
published. Resume from the tested branch and migrations through 0016.

## Preview rollout and pilot acceptance

- Apply migrations 0012 through 0016 to the isolated Preview database before
  publishing the matching branch. Do not deploy this work to production implicitly.
- Validate reload, access revocation, one-use links, date exceptions, change
  approval/rejection and client export/association with fictional records.
- Configure a verified sender, EMAIL_API_KEY and independent EMAIL_TOKEN_KEY;
  enable transactional mail explicitly, then test recovery and a controlled inbox.
  Existing Google invitations do not depend on this provider.
- Validate Google revocation/reconnect, provider outages and retry recovery against
  the real account. Check scheduled delivery support in the deployed environment.
- Confirm WhatsApp publication controls and professional restoration in Preview.
- Restore a remote D1 backup into an isolated target using the operator's account;
  the local SQLite drill is already automated, but is not remote acceptance.
- Agree retention, cancellation terms, support contact and external-provider erasure
  with the professional. Do not substitute archive or review state for deletion.
- Check logo/icon legibility and keyboard/mobile behavior on pilot devices.
  Connect the health checker to the operator's uptime monitoring.

Payments, clinical notes and automated WhatsApp messaging remain outside scope.
