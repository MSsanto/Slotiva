# ADR 010 — Professional services and immutable booking terms

Status: implemented; remote migration and hosted owner acceptance pending.
Date: 2026-10-22. Related: [tenant boundary](TENANCY_AND_RECURRENCE.md),
[API](API.md), [release procedure](HUMAN_VALIDATION.md#editable-services--migration-0006).

## Decision

The owner requested the entire service section be editable: service type, time,
and a price or no displayed price. A shared hardcoded array cannot express each
professional's practice. professional_services uses the composite key
(professional_id,id); the session or public slug chooses the owner. Each existing
and newly created professional receives the three legacy defaults. The
professional can rename/edit them, create additional services or deactivate them.
There is no hard-delete endpoint. Master manages professionals, not their catalog.

Fields are name, description, duration, price mode/cents, active state, version,
position and last_actor. Duration allows 15–240 minutes in increments of 5, including
50-minute sessions. Price modes distinguish paid (positive integer BRL cents),
free (zero) and hidden (null). Public output converts cents to BRL for display;
price processing/collection is not implemented. Starts remain every 30 minutes,
with a fixed 15-minute buffer. Duration editing does not change those separate
scheduling policies.

## Booking contract and races

An appointment is an agreement at a point in time. Every occurrence records the
service name, description, duration, price mode/cents and version selected at
creation. Service edits never rewrite these snapshots or existing occupied time.
Receipts and the professional agenda read snapshots. Pending request moves use
the original duration, including capability-protected availability after service
deactivation. Confirmed rescheduling keeps its existing contact-the-professional
rule. New agreements require an active service of the current tenant.

Edits use optimistic versions. Public requests and professional agreements include
serviceVersion; stale clients receive 409. INSERT triggers recheck the current
active catalog and exact snapshot, so an edit between lookup and INSERT cannot
silently accept changed terms. Snapshot updates are rejected by a separate guard.
Series creation loads one version and creates every occurrence in one atomic
batch. A conflict rolls back the series, occupancy, events and outbox. Identical
requestId retries return the original result even after service editing.

## Migration and release

Migration 0006 backfills original legacy terms and removes fixed service and
fixed-duration checks by rebuilding bookings. D1 always enforces foreign keys;
deferred checks permit rebuilding, but ON DELETE CASCADE still executes. The
migration explicitly backs up/restores occupied_slots before dropping bookings,
while retaining booking IDs and all series/audit/outbox references. It recreates
the transition, authorization, working-hours and occupancy triggers. The occupancy
generator covers all 17 units required by a 240-minute service plus 15-minute
buffer, including partial final 15-minute units for 5-minute durations.

A populated Miniflare/D1 upgrade compares all original fields and dependent rows
and checks foreign keys. This is local evidence, not evidence of remote migration.
Old Worker inserts lack snapshot fields and must not write to the new schema.
Follow the coordinated quiet-window/private-backup procedure, or provision a new
isolated homologation D1. Production and the older shared Preview stay untouched.

Primary reference: [D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
and [D1 SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/).
