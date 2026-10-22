# ADR 009 — professional ownership and agreed finite appointments

Status: implemented in 0.5.0; hosted acceptance remains pending.

## Professional ownership

The master account manages professional lifecycle. Each active professional owns
a stable `/p/{slug}` public page and its display name, title, subtitle and theme.
The professional can edit their branding but cannot change identity, slug or role.
The authenticated session supplies the tenant on private requests; the resolved
active slug supplies it on public creation. Customer capabilities are scoped to
one booking and hash. Master membership alone grants no client-data access.

Migration 0004 retains legacy data under demo. Hours and occupancy include
professional_id; occupancy's primary key is (professional_id,date,minute).
Triggers prevent cross-tenant booking reassignment and verify an active profile
and its hours inside each write. Different professionals may book the same time.
Profile versions protect edits and status changes; lifecycle events record actor.
Suspension revokes sessions and hides pages, with appointments preserved for
reactivation. Deletion is terminal, revokes access, cancels active appointments
and preserves history. Retired slugs/emails/subjects are not reused. A separate
retention/export/erasure process must be decided before pilot use.

## Psychologist discovery: 2026-10-21

The practitioner reported arranging a fixed weekly or fortnightly time with the
patient and entering it herself. This establishes a professional-led recurring
workflow alongside public appointment requests. It does not establish her session
duration, break, cancellation policy or consent to use actual patient data.

The professional explicitly confirms a prior agreement in one creation action.
This is an intentional exception to public 48-hour notice and pending approval;
only future time is required. Public endpoints cannot select this source.
Single, weekly (7-day) and fortnightly (14-day) agreements are supported with
1–26 occurrences, all within 366 days. Local wall time is preserved in the current
São Paulo-only calendar. All occurrences are materialized in D1, with no infinite
rule, automatic renewal or background extension. Email is optional for internal
entries; collect only an appointment identifier/name and necessary contact data.

A D1 transactional batch creates the series and all confirmed occurrences,
occupancy, confirmation events and outbox intent. Any collision rolls back the
whole batch; no occurrence is silently skipped. requestId plus normalized payload
hash provides tenant-scoped idempotency; simultaneous identical retries return
the same series, different contents under that key fail with 409. Unused random
customer secrets are hashed and discarded; the professional route does not issue
self-service customer access. The actor is stored on the series.

Cancel one appointment with the existing route, or cancel the selected occurrence
and subsequent future confirmed occurrences of its series. The latter requires a
server-resolved fromBookingId owned by the same tenant and series. Earlier future
encounters and historical occurrences remain unchanged. Repeated cancellation is
safe; there is no implicit "from now" cutoff when an anchor is missing. The dialog
names the selected date/time and the button says "Cancelar esta e próximas".
The series remains active while earlier future confirmed encounters remain.

This supersedes the original all-future-from-now behavior, which could cancel
encounters preceding the clicked row. The owner's report exposed the mismatch
between the row-level action/test instructions and that original implementation.
The changed boundary is intentional: the clicked occurrence determines the cutoff. Editing a series or moving a confirmed occurrence remains pending; cancel
and explicitly recreate after checking availability. No Calendar event, email or
invitation is sent; awaiting_integration is not delivery.

## Deliberate limits and verification

Services are still the shared 30/45/60-minute catalog and 15-minute buffer, with
30-minute starts. Per-professional service names/durations/pricing, date exceptions,
other timezones, conflict previews before submission and series-change proposals
remain work. The current conflict result rejects the entire series; it does not
list every conflicting date. UI shows finite count and cancellation scope before
confirmation. Validate these choices with the practitioner using fictional data.

Integration tests cover role/origin checks, cross-owner IDs, same-time different
owners, scoped hours/header editing, stale profile edits, suspension/deletion,
first identity binding, weekly/fortnightly spacing, conflict rollback including
outbox, concurrent retry deduplication and public-source bypass rejection.
Playwright covers professional fortnightly creation/occurrence cancellation/series
cancellation and a master UI journey with API fixtures. Real Google accounts and
remote resource isolation need the [human runbook](HUMAN_VALIDATION.md).
