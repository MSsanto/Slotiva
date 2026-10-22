# Change history

Recorded history begins on 2026-10-21. Earlier work remains in Git; it is not
reconstructed as a release without evidence. This English revision preserves the
meaning of earlier Portuguese entries, whose original wording remains in Git.

## 2026-10-22 — Separate Google Calendar consent and manual availability

- Records owner-reported successful login and blank service terms in Ana's profile.
- Adds Google-professional-only Calendar consent, distinct from identity sign-in:
  primary-calendar free/busy scope, PKCE, nonce, one-use session/subject-bound state
  and signed same-account verification without invitation-binding side effects.
- Adds AES-GCM encrypted refresh credentials with an independent secret, explicit
  disconnect and reconnection states, suspension cleanup and in-flight race guards.
- Adds an administrative interval-only availability lookup and panel. Provider
  failures never report free time. No public/confirmation conflict enforcement,
  Calendar events, invitations, email delivery or outbox consumer is claimed.
- Adds migration 0008, regression coverage and owner setup/acceptance documentation.
  Application 8712ff8 passed GitHub CI: 103 Worker tests and 11 browser journeys,
  plus frontend/build/lint/format/migration/dry-run/documentation checks.
  Google console configuration, real consent and remote rollout remain pending.

## 2026-10-22 — Optional duration and paid amount

- Implements the owner's correction: service duration and paid amount may be
  omitted or null. Blank means to be agreed, never zero or free. Public cards and
  administrative lists display the distinction; service forms have no defaults
  or required attributes for these fields.
- Services without fixed duration remain visible and direct the customer to the
  professional. No public time is advertised or occupied with an invented length.
  Professional entry accepts an explicit duration for that encounter/series,
  preserving concrete occupancy and immutable booking terms.
- Adds migration 0007 after the published 0006, preserving existing catalog,
  bookings and dependent rows. Adds Worker/browser and populated-upgrade coverage;
  remote migration and hosted acceptance remain pending.
- Application revision f328632 passed GitHub CI: 89 Worker tests, one frontend
  test and 10 browser journeys, plus build/lint/format/dry-run/documentation checks.

## 2026-10-22 — Editable professional service catalogs

- Adds per-professional service creation, editing and deactivation: names,
  descriptions, 15–240 minute durations in 5-minute steps, and paid/free/hidden
  pricing. Public cards and agreed-booking selectors use the owned active catalog.
- Stores immutable service terms on bookings, requires service versions on new
  requests and guards insert/edit races in D1. Existing receipts, occupancy and
  pending rescheduling retain original terms after service edits/deactivation.
- Migration 0006 seeds defaults and rebuilds bookings while preserving occupancy,
  history, series and outbox. Storage rejects fractional durations/cents even on
  direct SQL writes. Occupancy supports the full 240-minute maximum.
- Adds tenant, validation, concurrency-version, historical migration and browser
  coverage. Documents a private backup and coordinated homologation-only release;
  remote migration and hosted owner acceptance remain pending.

## 2026-10-22 — Separate cancelled reservations from the working agenda

- Adds Agenda and Cancelados tabs with counts, empty states and keyboard support.
  Agenda excludes cancelled rows; Cancelados retains their read-only history.
- Single/bulk cancellations leave the working list after the existing query
  refresh. No deletion, migration, backend or authorization change.
- Updates cancellation browser journeys and adds filtering/keyboard/read-only
  regression coverage; latest hosted layout acceptance remains pending.

## 2026-10-22 — Explicit cancel-only-this or cancel-all-series actions

- Implements the owner's revised choice: Cancelar só esta preserves other
  encounters; Cancelar todas da série cancels every future confirmed encounter of
  that series and preserves historical encounters. Both require confirmation.
- Adds explicit scope=all to bulk DELETE. Invalid, duplicate or mixed selectors
  fail closed; the earlier anchored cutoff API remains compatible without a UI
  option. Other series and other professionals remain isolated.
- Adds Worker and browser regression cases for both scopes and dismissals.
  Already cancelled encounters are not restored; hosted acceptance is pending.

## 2026-10-22 — Cancel recurring appointments from the selected occurrence

- Fixes the row action sending only a series ID and cancelling every future
  encounter from now. It now sends a required occurrence anchor and cancels that
  occurrence and later future encounters, preserving earlier future appointments.
- Makes the button and confirmation explicit about the selected date/time.
  Old clients without an anchor fail closed with 422; reload after deployment.
- Keeps occupancy/events atomic, retries safe and a partially active series active.
  No migration or automatic restoration of previously cancelled bookings.
- Records owner-observed weekly creation/individual cancellation and the report
  of excessive series cancellation. Hosted verification of the fix remains pending.

## 2026-10-22 — Owner validates approval and cancellation cycle

- Records hosted screenshot evidence of professional approval and cancellation,
  with the occupied time absent before cancellation and available again after it.
- Notes the owner's confirmation that the changed public header belongs to the
  same professional page; screenshots do not prove concurrent conflict handling.
- Customer receipt, recurrence and negative authorization/isolation remain pending.
  Documentation only; no application change or production release.

## 2026-10-22 — Owner validates positive hosted scheduling path

- Records owner-reported master login and fictional professional creation after
  the native fetch fix, plus screenshots of the public page and professional
  agenda with a public request awaiting approval.
- Distinguishes this evidence from completed approval, recurrence, cancellation,
  negative authorization and tenant-isolation acceptance, which remain pending.
- Documentation-only evidence update; no production release or new deployment.

## 2026-10-22 — Fix native Cloudflare fetch receiver in OAuth exchange

- Fixes the production fetch dependency default: call globalThis.fetch through an
  arrow wrapper so the dependency object is never passed as the native receiver.
- Reproduces the pre-network failure with the actual bundled Worker in workerd;
  the same regression passes after the fix. Existing mock tests missed the issue.
- Preserves credentials, account authorization, PKCE and one-use state. Hosted
  sign-in requires a fresh Preview deployment and owner confirmation.

## 2026-10-22 — Token exchange error classification

- Records owner evidence narrowing the login failure to the token exchange.
- Distinguishes exact allowlisted Google error codes and connection/provider
  availability without exposing descriptions, tokens or arbitrary response values.
- Adds regression coverage for code mapping, non-reflection, no sessions and
  transaction replay. The hosted cause remains pending a fresh diagnostic login.

## 2026-10-22 — Safe Google callback diagnosis

- Replaces the undifferentiated login failure with fixed stage codes and
  Portuguese guidance, preserving all existing authentication checks.
- Never reflects provider responses, tokens, account identifiers or exception
  messages; failed callbacks clear the transaction cookie and use no-store.
- Adds signed-token/D1 regression tests for failure classification and sensitive
  data non-reflection. The owner's generic failure is recorded without guessing
  its cause; hosted verification still requires a fresh Preview login.

## 2026-10-22 — Owner confirms Preview secret creation

- Records owner-provided Preview deployment and GOOGLE_CLIENT_SECRET creation
  output without receiving or storing the secret value.
- Documents an operator-only Google OAuth Playground/UserInfo procedure to
  obtain the verified master subject without changing Slotiva's OAuth callback.
- Master allowlist, actual secret validity and real OAuth acceptance remain
  unverified. No application code or production resource was changed.

## 2026-10-22 — Preview OAuth setup instructions consolidated

- Carries the existing OAuth Client ID registration into the product-readiness
  branch, preserving the separate implementation branch's history.
- Updates README configuration status and documents interactive secret commands
  scoped explicitly to feat/product-readiness.
- Makes the missing verified master subject and absent assisted bootstrap utility
  explicit blockers; no hosted OAuth success or production deployment is claimed.

## 2026-10-21 — Google Web Client ID registered for isolated Preview

- Records the owner-supplied public OAuth Client ID in the product-homologation
  `previews.vars` only. No credential secret or master identity was supplied.
- Documents the exact required Google Console callback, Preview-only secrets,
  master Google subject verification and negative/positive acceptance checks.
- No real OAuth sign-in, remote deployment, CI execution or production change is
  claimed; the button remains disabled until all server-side settings exist.

## 2026-10-21 — operator confirms hosted API health and closed login

- Owner supplied PowerShell responses from the stable product Preview:
  /api/health reports status=ok, storage=D1, approvalWorkflow=true;
  /api/auth/config reports googleEnabled=false and passwordEnabled=false.
  This supersedes the pending operator-side HTTP check, without claiming that
  earlier agent 403 responses diagnosed a database problem.
- Documents the next Google Web client creation steps and exact callback.
  Real consent, verified master identity and client/secret configuration remain
  pending. No secrets, application code or infrastructure settings changed.
- Documentation-only validation: local Markdown links, change matrix and diff
  consistency. No new application tests required; no production release performed.

## 2026-10-21 — stable product Preview origin and pending HTTP validation

- Owner-provided Wrangler output confirms successful 0.5.0 publication of
  feat/product-readiness, unique deployment 3e08d642. Records the stable Preview
  origin and configures PUBLIC_ORIGIN only in previews.vars, with the exact
  Google callback in the English acceptance guide. No credentials are added.
- Agent probes to health/auth config received HTTP 403/code 1010 and web retrieval
  could not access the endpoints. Hosted API health remains unverified; added
  exact PowerShell checks for the operator rather than claiming a database fault
  or successful OAuth. Google credentials and master identity remain pending.
- Validation: reviewed configuration diff, canonical-origin/binding assertions
  and documentation links/change matrix. No application code or schema change;
  no new application tests required. No production release performed.

## 2026-10-21 — homologation migrations confirmed by the owner

- Owner-provided Wrangler output identifies remote PREVIEW_DB as
  74b37b6b-7f9e-40a3-b685-546d7a0a76ac and reports migrations 0001–0005
  successful. This evidence is distinct from an independent remote schema query.
- Updated the English current-state/readme/acceptance notes to record applied
  homologation schema rather than pending migrations. Next steps are the matching
  Preview deployment/health check and real Google/master-account configuration.
- Documentation-only update: reviewed terminal evidence, local links and change
  consistency. No application code/configuration changed or new application tests
  required. No production migration/deployment is established by this output.

## 2026-10-21 — dedicated product-homologation D1 configuration

- Owner created slotiva-product-homologation, ID
  74b37b6b-7f9e-40a3-b685-546d7a0a76ac. Preview DB and migration PREVIEW_DB now
  target that same isolated resource. Production and the older shared Preview
  remain separate; no remote=true development override is committed.
- Documented backing up/restoring the creation wizard's local wrangler.jsonc
  changes before pulling the reviewed config. Updated migration/rollout evidence
  to distinguish successful database creation from unapplied schema and OAuth.
- Validation: binding/ID/isolation assertions, documentation links/change matrix
  and Wrangler dry-run; results are recorded with the PR checks. No remote
  migration, production deploy or claim of completed Google setup in this change.

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
- Reviewed the captured administrative form and aligned input/select spacing,
  font size and keyboard focus with the existing interface.
- Browser CI found an overly exact native-select label selector in the new
  recurrence fixture; relaxed it to match the visible frequency label. The other
  four browser journeys passed on that run; the complete suite is rerun after
  this correction.
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
