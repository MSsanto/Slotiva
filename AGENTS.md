# Slotiva contributor instructions

## Golden Rule — GitHub is part of every delivery

**EVERY CHANGE MUST BE IMPLEMENTED AND DOCUMENTED ON GITHUB. VERSION CONTROL IS AS IMPORTANT AS IMPLEMENTATION.**

Owner instruction recorded on 2026-10-21. Applies to implementation, tests,
configuration, migrations, documentation and architecture decisions.

- Start from the current repository state and preserve work from other branches.
- Publish descriptive commits and an appropriate branch/PR. Local-only changes
  are not a completed delivery.
- Update affected documentation and CHANGELOG.md with behavior, evidence and
  limitations. Explain architecture decisions in docs. Maintained documentation
  must be in English; application text may remain Portuguese.
- Distinguish planned, implemented, tested and deployed. A passing test is not
  proof of a deployment or permission to serve real customers.
- Run relevant checks. For documentation, review content, local links and diffs;
  do not claim application tests that were not run.
- Report the commit/PR, resulting behavior, validation and outstanding work.
  Failed GitHub publication means delivery remains pending.
- Never commit secrets, credentials, customer data, live databases or sensitive
  logs. Document external settings by name and procedure without secret values.
- A commit/push alone does not authorize a production deployment or remote
  migration. Inspect connected build automations and respect the authorized scope.

## Product and security

Slotiva targets a real scheduling product and a portfolio case study from one
codebase. Demonstrations/homologation use fictional data and isolated resources.
The README describes implemented behavior; the product specification describes
requirements. Preserve D1 occupancy atomicity and enforce authorization on every
administrative operation. Google authentication and professional authorization
are separate checks. The implemented tenant boundary derives professional_id from the authenticated
session or resolved public slug, never from a caller-supplied owner ID. A master
manages professional accounts but cannot read their appointment APIs. Suspension
revokes access; deletion removes the page and active reservations while preserving
history. Each professional owns hours, bookings, occupancy and a public header.

Professional-entered agreements may be confirmed in the creation action, with an
actor and finite weekly/fortnightly occurrences. Public requests still require
48-hour notice and explicit approval within 24 hours. Do not weaken public rules
to support professional scheduling. Keep series creation atomic and retries safe.

Separate read-only Calendar consent/manual availability is implemented; hosted
setup remains pending. Calendar event synchronization, transactional delivery and
client access recovery remain pending.
The pilot checklist is mandatory before inviting real customers. Never migrate
the older Preview database while an incompatible Worker can still write to it.
Follow docs/HUMAN_VALIDATION.md.
