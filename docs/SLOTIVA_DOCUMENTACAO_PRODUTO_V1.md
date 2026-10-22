# Slotiva — product and engineering requirements

Requirements version 1.3 · 2026-10-21 · Owner: Matheus Sergio.
This English revision preserves earlier decisions and adds master administration,
professional URLs/headers and the psychologist's weekly/fortnightly workflow.
Earlier wording remains in Git history. Requirements describe the target; the
[README](../README.md) and [API](API.md) define implemented 0.5.0 behavior.

## Purpose and current state

Build a scheduling product for appointment-based professionals, initially a barber
and a psychologist, with one codebase also serving as a portfolio case study.
Demonstration data/resources must remain separate from any eventual live pilot.
Do not present a specification, passing tests or successful upload as live readiness.

| Capability                           | Decision and implementation state                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Master administration                | Required; implemented Google master role creates, suspends, removes professionals                               |
| Professional page                    | Required; implemented stable /p/{slug}, name, header/subtitle/theme                                             |
| Professional identity                | Google required; code and synthetic-token tests implemented; real OAuth validation pending                      |
| Tenant isolation                     | Required; implemented session/slug ownership and tenant-scoped occupancy/hours                                  |
| Customer signup                      | No account/password required; current one-booking capability is memory-only                                     |
| Customer recovery                    | Temporary email links required; not implemented                                                                 |
| Public confirmation                  | Professional approval required; implemented pending requests, >=48h notice, 24h decision window                 |
| Internal agreements                  | Professional enters already agreed time; implemented single/weekly/fortnightly finite series                    |
| Google Calendar                      | Create events and consider external busy time; not implemented                                                  |
| Customer invite                      | Only after explicit approval and successful Calendar creation; not implemented                                  |
| Services                             | Implemented: tenant-owned names/descriptions, 15–240 minute durations, paid/free/hidden prices and deactivation; hosted acceptance pending |
| Clinical records, payments, WhatsApp | Outside initial scope                                                                                           |
| Deployment                           | Workers/D1 implemented; this increment is a PR, not a production release                                        |

## Journeys and acceptance

The master signs in with an explicitly authorized Google identity, provisions a
professional and public slug/header, then manages suspension/removal. A Google
account alone never grants a role. The master lifecycle platform does not imply
access to patient/customer appointments. The initial professional enrollment is
invitation-only; public self-registration is a separate decision.

A professional signs in, configures their page/hours, reviews public requests,
approves/rejects and enters agreed appointments. The psychologist specifically
reported agreeing a fixed weekly or fortnightly time with the patient and entering
it herself. Professional-created series therefore explicitly confirm the agreement
at creation. They must not require each patient to request every occurrence or
reapply the public 48h/24h workflow to an already agreed series. The initial
implementation has finite count, no automatic renewal and no clinical content.

A customer opens the professional's URL, chooses service/time and submits contact
data without a password. They see “pending — not confirmed” and the decision
deadline. Only professional approval confirms. A future notification/invite flow
must distinguish booking confirmation, sync status, message delivery and acceptance.
Customers eventually recover access using email, without contact enumeration.
The current memory token is an interim capability, not that recovered access.

| ID   | Required acceptance                                                                             |
| ---- | ----------------------------------------------------------------------------------------------- |
| RF01 | Forged/expired/wrong-audience Google tokens cannot authorize access                             |
| RF02 | A cannot read/change B's appointments, hours, branding or series by changing IDs                |
| RF03 | Implemented: per-professional service configuration with immutable booking terms; migration 0006 and hosted acceptance pending |
| RF04 | Availability respects tenant, local time, hours, duration, buffers and blocks                   |
| RF05 | Public creation is pending, >=48 elapsed hours ahead; approval expires at 24 elapsed hours      |
| RF06 | Concurrent overlapping writes produce at most one active internal reservation per professional  |
| RF07 | Future email links expire, consume once atomically and resist scanners/replay                   |
| RF08 | Customer access is restricted to the granted booking/tenant; contacts alone grant no history    |
| RF09 | Calendar retries do not duplicate events; external conflicts become visible and recoverable     |
| RF10 | Invitations use neutral titles; delivery and acceptance are never assumed                       |
| RF11 | Finite series creates all dates atomically or rejects all; no silent skipped occurrence         |
| RF12 | Single-occurrence versus future-series changes are explicit and preserve history                |
| RF13 | Email/Google failure has visible, recoverable state separate from booking state                 |
| RF14 | Portfolio/demo never exposes live personal data or secrets                                      |
| RF15 | Only authorized master manages lifecycle; suspension/removal revoke access and hide pages       |
| RF16 | Individual public URL displays only its professional's approved header                          |

## ADR 002 — customer access without passwords (pending)

Use a high-entropy token with hash, purpose, expiry, tenant/booking scope and atomic
consumption. Proposed lifetime: 15 minutes, single use, subject to usability tests.
Request responses are generic and rate-limited by origin and destination. A GET
shows a neutral page; explicit protected action consumes the link, avoiding email
scanner consumption. Create a restricted session and redirect to a token-free URL.
No third-party analytics/assets on token pages; restrict referrers and redact logs.

Shared email addresses do not justify silently joining histories. If ambiguous,
issue access to one booking and resolve identity with the professional. An
unverified contact on a new request must never attach an existing patient history.
Loss of email access requires an agreed identity-check/support procedure, audited
contact changes and revocation of earlier access. Public knowledge of a name,
phone or address is not enough to change ownership.

## ADR 003 — clients and contacts (target model)

Use permanent internal client IDs, separate from email/phone contacts and their
verification status. Normalize phones with country/area codes; do not strip email
dots or arbitrary suffixes. Do not impose globally unique patient contacts: minors,
guardians and shared addresses require explicit resolution. Conflicting matches
never cause automatic merge. Current booking-level name/email fields do not yet
implement this client/contact model or phone collection.

## ADR 004 — Calendar and source of truth (pending)

Slotiva is authoritative for reservations and business rules. Google provides
calendar presentation and external busy-time data, not a cross-system atomic
transaction. Identity-only sign-in does not grant Calendar permission. A separate
server OAuth consent requests only necessary scopes for the chosen calendar.
Encrypt stored refresh credentials with a separately managed key; do not store
provider credentials in the browser. Handle revocation, reconnection and expiry.
Disconnecting must explain the disposition of existing events and erase credentials.

Commit confirmation plus durable sync intent in the same internal transaction.
Send with stable idempotency, bounded retries, failure handling and reconciliation.
Consult external occupancy before confirmation; detect simultaneous external edits
and ask the professional to resolve them, without silently moving/cancelling a
patient. If reliable external availability is unavailable, pause dependent
confirmations or require explicit reviewed intervention. Pilot edits should occur
in Slotiva; detect external changes to linked events rather than overwriting them.

Only after successful Calendar event creation add the customer attendee/send
updates. Acceptance, auto-display and notification behavior depend on the provider
and user settings. Preserve event identifiers across updates/cancellation. An ICS
export, if added, must explain limited update propagation and must not masquerade
as a second booking. Use neutral titles, no diagnosis/session reason or other
patients' identities. Proposed implementation: individual linked events per
occurrence; native Calendar recurrence is an alternative, not a delivered choice.

## ADR 005 — persistence and concurrency

Workers + D1 host this implementation. SQL-trigger interval ownership enforces
internal occupancy atomically; per-professional serialized coordination remains
an option if future external-sync requirements justify it. Do not replace a proven
constraint with a read-then-write availability check. Half-open appointment windows
plus the configured buffer determine occupied intervals. Rescheduling must keep
the original interval if the replacement fails. The tenant service catalog with immutable booking terms
is constrained in SQL; migration 0006 implements variable durations and requires
a coordinated schema/code release.

Target entities beyond implemented profiles/sessions/bookings/hours/series/outbox:
clients, verified contacts, date-specific blocks, Calendar
connections, event links, restricted access tokens and actor-rich audit events.
Every business reference must preserve professional ownership. Avoid destructive
cascades that erase history without a defined policy. Completed/no-show and sync
pending/synced/failed/disconnected are target states; current booking states are
pending_approval/confirmed/rejected/expired/cancelled only.

## ADR 006 and 007 — approval, notice and rescheduling

Public booking is a request, not confirmation. Server clock must enforce
start_at >= creation + 48h and approval deadline = creation + 24h. These are elapsed,
not business hours. At the exact deadline, expiration wins. Atomic decisions,
versions, scheduled/request-time cleanup, interval release and outbox intent
protect races. A Monday 10:00 request can start no earlier than Wednesday 10:00;
approval must occur before Tuesday 10:00. Test both sides of each boundary.

Pending customer edits retain the original deadline and recheck notice. The target
confirmed-reschedule flow keeps the original booking valid until the professional
approves a separate change proposal; rejection/expiry keeps the original. That
proposal flow is pending; the current API blocks confirmed customer moves.
Public recurring requests are not supported. Explicit professional agreement is
the separately authorized creation path described in [ADR 009](TENANCY_AND_RECURRENCE.md).

## Privacy, operation and pilot gate

Slotiva schedules appointments; it is not a clinical record. Even appointment
metadata is sensitive in this context. Collect no diagnosis, session notes or
clinical reason; keep contacts/tokens/private events out of URLs, logs and portfolio.
Before real customers, agree privacy notice, responsibilities, purposes, retention,
export/erasure, incident handling and support. Terminal professional removal is
not personal-data erasure. Define guardian/minor handling with the professional.

Separate demo/test/production credentials and data. Add public reservation/link
abuse controls. Monitor conflicts, failed auth, sync backlog, rejected mail and
revoked integrations without logging private payloads. Failed jobs need bounded
attempts and human recovery. Test protected backups by restoring an isolated
copy; proposed RPO 24h/RTO 4h are targets requiring evidence and practitioner agreement.
After restore, reconcile external events before reopening. On suspected compromise,
revoke affected access and preserve evidence without exposing private content.

The pilot requires completed identity and tenant tests, real email/link acceptance,
real Calendar consent/busy-time/invite/revocation/reconciliation checks, recurrence
and exception checks, agreed services/cancellation policy, tested restore,
operational ownership and manual keyboard/mobile/screen-reader validation. Record
professional approval with fictional data before inviting real clients. Follow
[human validation](HUMAN_VALIDATION.md); there is no claim that this gate has passed.

## Remaining discovery and cost assumptions

The psychologist's professional-entered weekly/fortnightly workflow is now known.
Still decide her duration/break, preferred finite horizon, cancellation rules,
minors/guardian contacts, connected calendars, who funds/operates support and the
email sender/domain. Per-tenant service editing, date exceptions and series edits
are separate work. Payments and WhatsApp remain outside the initial increment.

The earlier R$0–40/month discussion is an unverified hosting hypothesis, not a
quote or operating guarantee. Verify actual provider quotas/prices, usage, domain,
transactional email, storage, support, taxes and exchange rates before budgeting.
Google login alone does not imply a paid authentication subscription; Calendar
and Cloudflare still have limits and operational costs to validate. No fixed
current price is asserted here.

Maintain one codebase and use authorized aggregate evidence for a portfolio case
study: problem, decisions, architecture, tests and actual outcomes. Do not claim
live adoption before it occurs. Do not publish identifiable patients/screenshots.

## History and primary references

v1.0 established product/portfolio, identity/recovery, Calendar and pilot goals;
v1.1 added explicit professional approval/invite ordering; v1.2 fixed public
48h/24h limits; v1.3 adds master/tenant pages and professional-led finite recurrence.
[ADR 008](GOOGLE_AUTH.md) selects server OIDC; [ADR 009](TENANCY_AND_RECURRENCE.md)
records implementation limits. Earlier requirements and delivery notes remain
available in Git history, not silently claimed as deployed.

[Google identity](https://developers.google.com/identity/gsi/web/guides/overview),
[server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[Calendar event creation](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert),
[Calendar quotas](https://developers.google.com/workspace/calendar/api/guides/quota),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
