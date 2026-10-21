# Professional approval — implementation 0.4.0

## Implemented scope and limits

This workflow was introduced in 0.4.0 and remains the public-request contract in
0.5.0. Professional Google identity, master lifecycle administration, individual
pages and finite professional-entered agreements are now implemented separately;
see [ADR 008](GOOGLE_AUTH.md) and [ADR 009](TENANCY_AND_RECURRENCE.md).
Calendar, transactional email and customer email recovery remain pending. Demo
password access is isolated; hosted product environments require Google.

Public requests require at least 48 elapsed hours of notice. Creation stores
`pending_approval`, `version = 1` and `approval_expires_at = created_at + 86400`
using the database clock. The UI shows the pending status and deadline in
America/Sao_Paulo. Both pending and confirmed appointments own occupied intervals
through the existing D1 triggers; concurrent overlap is rejected.

## State transitions and contract

| Operation            | Endpoint                                              | Result                                                                 |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Request              | POST /api/public/{slug}/bookings                      | 201; pending_approval, approvalExpiresAt, version and cancelToken      |
| Read receipt         | GET /api/bookings/{id}                                | X-Cancel-Token required; terminal states remain readable               |
| Approve              | POST /api/admin/bookings/{id}/approve                 | Session, exact Origin and JSON {version}; confirms before the deadline |
| Reject               | POST /api/admin/bookings/{id}/reject                  | Session, exact Origin and JSON {version}; releases occupancy           |
| Cancel               | DELETE /api/bookings/{id} or /api/admin/bookings/{id} | Customer token or professional session; releases occupancy             |
| Edit pending request | PUT /api/bookings/{id}                                | Token required; rechecks 48h notice, preserves original deadline       |

A pending request can become confirmed, rejected, expired or cancelled. A
confirmed appointment can be cancelled. Terminal states cannot be reactivated.
Requests changing state or time increment the version. Unknown IDs return 404;
invalid payload/notice returns 422; state/version/interval conflicts return 409.
The existing authentication and Origin errors remain 401 and 403.

Approve/reject retries return success only if the current status matches the
requested outcome **and the current version equals the submitted version + 1**.
That replay makes no database change and creates no additional event/job.
Different versions return 409 even if the current status matches. After editing
a request, an old approval screen cannot approve the changed request without
refreshing its version. Approval at the exact deadline or later is rejected.

Confirmed customer rescheduling is blocked with 409 and an instruction to contact
the professional. A full change-proposal flow that retains the original confirmed
appointment until approval is deferred. Editing a pending request remains allowed
and does not extend its deadline; this is not an immediate move of a confirmed
appointment.

The administrative list includes cancelled, rejected and expired history.
The panel and open customer receipt poll every 15 seconds. The backend is the
authority; hiding a button is not an authorization control.

## Expiration, atomicity and notification intent

`worker/approval.ts` uses a guarded UPDATE with database status, version and
clock predicates. Migration `0002_professional_approval.sql` enforces transitions.
Existing occupancy triggers release intervals and transition triggers insert
`booking_events` and `notification_outbox` in the same transaction. A failure in
any trigger rolls back the status, version, occupancy and audit/outbox inserts.

`expirePending` runs before agenda operations and through a five-minute Cron.
A late scheduled execution cannot allow a late approval because the decision
itself checks the deadline. Expiration is safe to repeat. Cron activation requires
a deployment of its configuration; local handler tests do not establish that
Cron is running remotely. Worker Previews do not execute production Cron triggers;
request-time expiry remains available there.

The outbox has a unique (booking_id, kind, booking_version) key and starts in
`awaiting_integration`. **No external email, expiry notice or Calendar invitation
is sent.** These are durable intents for a future integration, not proof of
provider delivery. Approval currently revalidates internal availability only:
there is no Google connection or external busy-time check in this slice.

Events record previous/new status, timestamp and version. Identity is verified
on protected requests and series/profile lifecycle events include an actor;
individual public-booking transition rows do not yet distinguish customer from
professional cancellation actors. Public request abuse controls,
contact verification and delivery monitoring are also still required for a pilot.

## Migration and release procedure

Migration 0002 preserves old active bookings as confirmed and old cancelled
bookings as cancelled. Existing occupancy is retained. No historical invitations
are generated. New INSERT/UPDATE operations must satisfy the new trigger contract.

**Do not run the new Worker against the old schema or keep the old Worker writing
after applying migration 0002.** Neither order is safe without coordinated write
suspension. Prepare an authorized backup and maintenance window: pause writes,
apply the migration, deploy the matching Worker, validate health and complete
fictional lifecycle checks, then reopen writes. Do not roll back only the Worker:
old writes cannot satisfy the new triggers. A rollback needs a compatible schema
and data plan that preserves history.

`main` is connected to Workers Builds. This change stays in a PR; merge is not a
substitute for coordinating migrations and release. PR #1 contains the separate
Preview/documentation setup. Do not apply this migration to its shared Preview
database while an older Preview still writes there. Use a dedicated approval
Preview database, or retire incompatible Preview writers in an authorized window.
The current Preview and migration configs target the dedicated product-homologation
D1 created by the owner, rather than the older shared Preview. Follow
[human validation](HUMAN_VALIDATION.md) to apply its schema and verify the deployment. No remote migration or production release was performed for this review.

## Verification and evidence

- Miniflare/workerd with isolated local D1: simultaneous requests, direct SQL
  overlap, sessions, Origin, version checks, rejection, expiration and rollback.
- Exact 48-hour rule, deadline behavior and repeated scheduled expiration.
- Legacy schema upgrade with active/cancelled data and no retroactive outbox.
- Decision replay with matching versus stale/arbitrary versions.
- Concurrent customer edit versus professional approval: one effective result.
- Simulated outbox failure: rejection and slot release both roll back, then a
  retry succeeds with one transition/job.
- Playwright: request, pending edit, professional approval, cancellation and logout;
  the customer receipt stays open while a second tab decides, verifying polling
  and removal of unavailable actions;
  mobile overflow/keyboard entry and axe on the initial screen at two viewports.
  This is not a complete manual accessibility audit.

Run the repository CI checks. Commit-specific results belong in the PR/changelog;
test presence alone does not demonstrate a passing run or production readiness.

## Tenant and professional-agreement extension (0.5.0)

Migration 0004 partitions bookings/hours/occupancy by professional and keeps
legacy data under demo. Decisions query the authenticated professional as well
as booking ID/version; master role does not authorize these routes. Migration
0005 permits an explicit professional agreement to start confirmed with actor-
attributed finite series ownership. It does not weaken public 48h/24h guards.
All occurrences and confirmation events/outbox intents commit atomically.
Deletion of a professional cancels active reservations while retaining history.
See [the current API](API.md) for complete routes and [ADR 009](TENANCY_AND_RECURRENCE.md)
for deliberate limits. Existing pending/confirmed state transition rules remain.
