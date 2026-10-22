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

## Explicit cancellation choices — revised 2026-10-22

The owner's latest requirement is two visible actions: "Cancelar só esta" and
"Cancelar todas da série". The former uses the individual booking route and
preserves every other encounter. The latter sends scope=all explicitly and
cancels every future confirmed occurrence in that owned series, including those
before the clicked row. Historical encounters are preserved; other series and
other professionals are never part of the selection. Both confirmations describe
the scope. Declining either confirmation sends no request.

This replaces the UI's intermediate "Cancelar esta e próximas" choice. Its
fromBookingId API remains available for compatibility and still preserves earlier
future encounters, but it is not a third visible option. Missing, unknown,
duplicate or mixed scope selectors fail closed. Series status stays active after
partial cancellation and becomes cancelled when no future confirmed encounters
remain. Already cancelled rows are not reactivated or cancelled twice.

Editing a series or moving a confirmed occurrence remains pending; cancel
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
