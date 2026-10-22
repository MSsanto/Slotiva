# Documentation control

## Authority and scope

Code and migrations define implemented behavior. Documentation must explain
that behavior and cite its source; plans must be labelled pending. README is the
entry point, API.md is the route contract, and ADRs record architecture decisions.
Do not claim deployment, security certification or full accessibility compliance
from a local test or green CI run.

## Documentation language

English is required for all maintained repository documentation, including the
README, API contract, ADRs, policies, setup guides and PR templates. New and
updated documentation must remain in English. Preserve code identifiers, routes
and exact application messages when quoting them; Portuguese product UI text
is independent of the documentation language. Reviewers must verify language
consistency; the current automated checker does not detect natural language.

## Mandatory change matrix

The `Documentation / check` CI job enforces these pairs on the complete change
range, with no label or checkbox bypass:

| Changed files                                                                | Required update in the same change |
| ---------------------------------------------------------------------------- | ---------------------------------- |
| `worker/**`, `migrations/**`                                                 | `docs/API.md` and `README.md`      |
| `src/**`, `index.html`                                                       | `README.md`                        |
| `wrangler.jsonc`, package files, TypeScript/Vite config, `.dev.vars.example` | `README.md`                        |
| Tests, scripts, workflows, PR template, documentation checker                | `docs/DOCUMENTATION.md`            |

Even an internal change must record its lack of contract impact in the affected
document when this matrix applies. Architecture changes also require an ADR;
that semantic requirement needs reviewer judgment. Never edit an applied SQL
migration to change production behavior: add a new migration and document it.

## Review requirements

Each PR must identify changed behavior, affected documentation, source files,
validation and remaining limitations. Reviewers compare factual statements to
code and test scope. A touched document alone does not establish correctness.
Do not include credentials or customer data in examples or evidence.

The checker verifies required files, local Markdown file targets and the change
matrix. It does not validate external URLs, heading anchors or prose semantics.
Run `node scripts/check-docs.mjs <base-commit>` before opening a PR. CI supplies
the pull request base SHA or push before SHA; manual runs check the previous
commit. An initial push checks the whole tree.

## Repository enforcement boundary

The check can fail CI but cannot prevent a direct push or administrator bypass
by itself. Repository rules must require pull requests and the `check` status
from the Documentation workflow, restrict direct pushes, and configure review
approval appropriate to the maintainer model. Verify the displayed status name
on the first run before configuring it as required. Do not describe this as a
protected branch until GitHub rules have been inspected and confirmed.

## Audit baseline: 2026-10-20

Reviewed against commit `d67776eb514c09e33fafa8f2305760497acfcdf8`:
README, API routing/rules/security, initial migration, Worker tests, browser tests
and CI workflow. Corrected the claim that absent password configuration closes
all administration: existing sessions survive. Clarified successful login counter
reset and the limited mobile/desktop accessibility coverage. Added route contract
and architecture rationale. This audit did not certify live administrative setup,
branch protection, production deployment identity or manual accessibility.

## Preview configuration follow-up

The preview build failed before compilation because the explicit `previews`
block was missing. The configuration now uses a separate D1 UUID and a dedicated
migration config. Verify the Preview and migration UUIDs match each other and
differ from production when reviewing changes. Remote migration execution and
Preview health require separate operational evidence; a valid configuration or
successful upload alone is insufficient.

## Product-readiness increment — 2026-10-21

The maintained English set now covers master administration, per-professional
URLs/headers, Google identity and explicit finite agreements. Keep requirements,
implemented routes, test evidence and deployment evidence separate. Every behavior
change also needs a meaningful changelog entry and an ADR when it changes ownership,
identity or scheduling policy. The file matrix is a minimum, not a prose-quality test.

The earlier Preview configuration follow-up above describes its historical setup;
0.5.0 initially disabled both bindings until isolated resources were available.
The owner has now created product-homologation D1; matching reviewed bindings are
committed. Current instructions are in HUMAN_VALIDATION.md; never restore the
incompatible old shared UUID when following a historical command. Do not describe a successful static
upload as a working backend or a passing synthetic OAuth test as real consent.

Added Worker tests exercise signed identities, one-use OAuth transactions,
role/tenant isolation, profile lifecycle, scoped hours and atomic/idempotent
recurrence. Browser coverage adds a real local professional fortnightly journey
and a master screen test with API fixtures; the latter does not replace real
master authorization tests or hosted OAuth acceptance. Initial-screen axe scans
remain narrower than the full application. All tests use fictional isolated data.

The main branch API reported protected=false on 2026-10-21. Required reviews/checks
must be configured through repository administration; CI alone is not a merge
restriction. Record actual settings and rerun evidence after any configuration
change rather than asserting protection is enabled.

Additional recurrence regressions verify the explicit under-48h professional
agreement path while public requests still fail, the 366-day horizon and
professional removal cancelling confirmed series without erasing audit history.

Browser fixture correction: frequency selection uses the visible native-select
label without an exact full-label-text match, avoiding dependence on option text
within a wrapped label. This changes the test selector, not booking behavior.

## Dedicated homologation binding — 2026-10-21

Check that Preview DB and migration PREVIEW_DB use the same new homologation ID,
differ from production/old Preview, and have no remote local-development override.
The owner's successful creation output establishes resource creation only, not
schema migration, usable Google sign-in or healthy deployment. Configuration
checks and dry-run are separate from these external acceptance results.

Callback diagnostic regression coverage uses signed synthetic identities and D1 to
exercise transaction, provider, identity, authorization, session, configuration and
origin failures. Tests check fixed redirects, cookie cleanup, no session creation
and non-reflection of arbitrary error/query text. These checks do not identify the
owner's hosted failure until the updated Preview is exercised.

For the callback diagnostic update, 62 Worker tests, production build, lint and
format checks passed locally. Two new browser cases cover authorization guidance
and an unknown/prototype-key reason fallback. Local browser execution was blocked
before assertions by a missing Playwright executable; its browser download returned
an invalid archive. Browser acceptance must therefore be established by CI or a
working browser installation, not claimed from this local attempt.

Token-exchange regression cases cover exact allowlisted errors, unknown/malicious
values, malformed responses, network failure, HTTP 429/5xx and code replay. They
assert fixed redirects, no session, consumed transaction and no second exchange.
Real Google token exchange remains an operator acceptance step.

A separate native-runtime OAuth regression bundles worker/index.ts into Miniflare,
applies all migrations, starts a real OAuth transaction and invokes the callback
with its browser cookie. It leaves the production transport dependency default in
place, intercepts only outbound I/O, checks token request parameters, propagates a
safe provider refusal, creates no session and prevents a second exchange on replay.
The test failed on the old receiver with zero outbound exchanges and passed after
the global fetch wrapper. Provider interception is not real Google authentication.

Validation for the receiver fix: 74 Worker tests across five files, production
build, lint and format checks passed locally. The new runtime test was observed
failing before the fix and passing after it. Browser/real Google acceptance is
not implied by these results.

Series cutoff regression coverage exercises weekly and fortnightly bookings in the
bundled Worker/D1: earlier future encounters survive, previously cancelled ones
stay unchanged, selected/later occupancy is released, versions remain stable on
retry, and a partially cancelled series remains active. Missing/malformed anchors
fail closed; foreign-series and foreign-tenant anchors cannot cancel bookings.
The browser journey now selects a middle occurrence and checks earlier survival
and an explicit confirmation dialog. Local browser execution remains pending due
to the previously unavailable Playwright browser installation.

For the selected-occurrence correction, all 77 Worker tests, production build,
lint and formatting passed locally. Three new cases failed against the old
implementation and passed after the change. Hosted and browser confirmation of
this changed cancellation boundary remain pending.

For the explicit one/all cancellation UI, Worker regressions cover single-row
isolation, all future encounters (including earlier future ones), repeated bulk
requests, other-series/other-tenant preservation, occupancy release and rejection
of ambiguous scopes. The browser journey tests dismissal and acceptance of both
confirmations and observes single versus all outcomes. All 80 Worker tests,
production build, lint and formatting passed locally. Browser/hosted acceptance
of the new choices remains pending; the existing cutoff API tests remain valid.

Cancelled-history UI regression coverage updates the real booking and series
cancellation journeys to verify removal from Agenda and preservation in Cancelados.
An API-fixture journey verifies default selection, counts, correct filtering,
read-only cancelled rows, arrow/Home/End focus navigation, empty states and no
mutation requests from tab switching. This is UI coverage, not new backend
security evidence. Backend behavior, history storage and authorization are unchanged.


Service-catalog verification adds seven bundled Worker/D1 cases covering role/origin
and cross-tenant access, duration and price validation (including fractional SQL
values rejected by storage constraints), stale edit/booking versions,
immutable receipts, rescheduling after deactivation, maximum-duration occupancy,
cancellation release, closed working days, an empty active catalog and recurring
retry stability after editing the catalog.
The populated upgrade test compares all original booking fields, every occupied
slot, series, audit and outbox row before/after migration 0006 and checks foreign
keys. The browser journey creates a service, edits duration/name, checks paid/free/
hidden rendering, preserves an existing booking's terms and deactivates the card;
it also audits the open editor with axe. Local browser execution is unavailable
because the Playwright Chromium download did not install; GitHub CI is the browser
verification source. Remote migration and owner acceptance are separate checks.

Local service-catalog checks passed: 89 Worker tests, one frontend test, production
build, lint and formatting. The build reports a client chunk just above 500 kB;
this is a performance warning, not a failed compilation.


Optional-term regressions verify omitted/null catalog duration and paid amount,
public no-duration refusal without occupancy, explicit per-agreement duration,
null paid-price snapshots and invalid fixed-duration overrides. The migration
upgrade also compares custom v6 services/bookings and catalog edits across 0007.
The browser journey now saves both fields blank, verifies to-agree labels and no
public slots, and enters a professional agreement with its own duration. These
new cases supersede the first catalog contract's mandatory fields. Prior catalog
revision 735fcfe passed full GitHub CI; the optional-term revision needs its own CI.
