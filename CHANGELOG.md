# Change history

Recorded history begins on 2026-10-21. Earlier work remains in Git; it is not
reconstructed as a release without evidence. This English revision preserves the
meaning of earlier Portuguese entries, whose original wording remains in Git.

## 0.5.0 — identity, master administration and professional agreements (2026-10-21)

- Consolidates the approval and strict-documentation branches without deploying
  production. Adds server Google OIDC, signed token verification, PKCE, one-use
  state/browser binding/nonce, rotating hashed sessions and explicit authorization.
- Adds Google master administration to create/edit/suspend/reactivate/remove
  professionals, stable /p/{slug} pages and customizable headers/themes. Professional
  routes derive ownership from the session; public creation resolves the active
  slug. Master role does not grant appointment API access.
- Migration 0003 adds OAuth/session provenance; 0004 partitions hours, bookings
  and occupied intervals, preserves demo data and records profile lifecycle.
  Suspension revokes sessions; deletion also cancels active reservations while
  retaining history and retired URLs.
- Records psychologist discovery: practitioner agrees a fixed weekly/fortnightly
  time with the patient and enters it herself. Adds directly confirmed single or
  finite recurring agreements, 1–26 occurrences within 366 days. Migration 0005
  atomically creates occurrences/events/outbox; conflicts roll back all dates and
  tenant-scoped request IDs deduplicate simultaneous retries. Supports cancelling
  one occurrence or all future occurrences, without automatic renewal.
- Preserves public 48h notice/24h approval rules. Email is optional for internal
  agreements; no clinical notes are collected. Fixed services/buffer/timezone,
  series editing, date exceptions and service customization remain limitations.
- Preview D1 and the old Preview migration target are deliberately disabled to
  protect the incompatible older shared Preview. New isolated D1, external OAuth
  setup and human acceptance are specified in docs/HUMAN_VALIDATION.md.
- Updates maintained docs to English, including current API, product requirements,
  visual identity, ADRs, governance and operational handoff. Preserves approved
  logo variant decisions from main; final logo exports/application remain pending.
- Local evidence: 54 Worker/rule/identity/tenant/recurrence tests and one frontend
  unit test passed; build passed. Final formatting/lint/dry-run/documentation and
  browser CI evidence are recorded in the PR after the final checks.
- No remote migrations or production deployment performed. Email delivery,
  recovery, Calendar authorization/busy times/events/invites and pilot operating
  readiness remain pending; outbox awaiting_integration is not a sent message.

## 2026-10-21 — approval review and version-safe retries

- Reviewed PR #2 rather than duplicating its implementation. Fixed decision
  replay: only the version immediately preceding the same outcome succeeds;
  stale/arbitrary versions return 409 without another event/job.
- Added concurrent customer edit versus approval, stale replay after edit and
  outbox-failure rollback regressions. Fixed the browser fixture to choose
  nonoverlapping edit times and scope customer status assertions to the receipt.
- Published the approval runbook in English. Clarified legacy password sessions,
  accessibility coverage and the incompatible older Preview migration boundary.
- Evidence: 22 Worker/rule tests, one frontend test, formatting, lint, build and
  dry-run passed locally. Local Chromium download failed; GitHub CI run
  39652673816 subsequently passed, including two browser tests.
- No remote migration, deploy or real-customer release. Identity, Calendar,
  notifications and confirmed change proposals were still separate work then.

## 0.4.0 — professional approval implementation (2026-10-21)

- Introduced pending requests, 48h notice, fixed 24h deadline, authenticated
  approve/reject, versions and customer token-based status polling.
- Added request-time/five-minute scheduled expiry, atomic occupancy release,
  transition history and durable outbox intent without a sender.
- Migration 0002 preserves earlier active bookings as confirmed; pending edits
  retain their original deadline and confirmed customer moves are blocked.
- Initial evidence: formatting, lint, frontend test, 19 Worker/time-rule tests,
  build, local D1 migration and dry-run passed. Local browser execution was blocked
  by unavailable Chromium/download and Wrangler interface enumeration; API tests
  used Miniflare/workerd. Later review expanded and completed CI coverage above.
- No remote migration/deploy; at this point identity, recurrence and multiple
  professionals were pending, as were Calendar and mail.

## 2026-10-21 — approved pilot temporal policy

- Requirements v1.2 fixed >=48 elapsed hours for public notice and 24 elapsed
  hours for approval. Expiry releases intervals and queues intent without invites.
- Documented boundary examples and approval/expiry races; implementation was
  pending at the time. Documentation consistency review only; no deployment.

## 2026-10-21 — approval and invite ordering

- Requirements v1.1 made new requests pending and required professional approval.
  Calendar invites follow successful approval/event creation; failure recovery
  must avoid duplication. Holds, expiry and confirmed rescheduling were proposals
  awaiting pilot decisions. Reviewed Calendar Events.insert reference; no code tests
  or deployment were claimed for that documentation-only change.

## 2026-10-21 — product requirements and governance

- Added product/portfolio requirements, professional Google identity, customer
  email recovery, Calendar, recurrence and pilot criteria. Recorded the Golden
  Rule in AGENTS.md: every change is implemented/documented on GitHub.
- Added implementation-versus-target index and README links while preserving
  documented D1 guarantees. Reviewed diffs/local Markdown links; application
  tests were not run for this documentation-only change. No infrastructure change.

## 2026-10-21 — approved visual applications

- Main commit ee76caa documents full logo for presentation/home, compact name+
  symbol for app header and symbol-only favicon/mobile icons. Final exports and
  UI application remained pending. These decisions are preserved in the English
  visual identity document in this increment.
