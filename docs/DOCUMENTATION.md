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
0.5.0 intentionally disables both Preview D1 and its old migration target. Current
instructions are in HUMAN_VALIDATION.md; never restore the incompatible old shared
UUID when following a historical command. Do not describe a successful static
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
