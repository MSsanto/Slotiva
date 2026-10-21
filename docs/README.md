# Slotiva documentation

| Document                                                      | Purpose                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| [Project README](../README.md)                                | Implemented 0.5.0 behavior, local setup and limits            |
| [API](API.md)                                                 | Public, customer, professional and master route contract      |
| [Product requirements](SLOTIVA_DOCUMENTACAO_PRODUTO_V1.md)    | Decisions and target behavior; implementation states explicit |
| [Google identity — ADR 008](GOOGLE_AUTH.md)                   | Verified OAuth and role/invitation authorization              |
| [Tenancy and recurrence — ADR 009](TENANCY_AND_RECURRENCE.md) | Ownership, removal and psychologist's agreed-time workflow    |
| [Human validation](HUMAN_VALIDATION.md)                       | Isolated D1/OAuth setup and acceptance before release         |
| [Approval workflow](APPROVAL_WORKFLOW.md)                     | State machine, temporal limits, atomicity and migration       |
| [Cloudflare architecture — ADR 001](ADR-001-cloudflare.md)    | Original backend replacement                                  |
| [Visual identity](IDENTIDADE_VISUAL.md)                       | Approved logo variants and implementation boundary            |
| [Documentation control](DOCUMENTATION.md)                     | Mandatory updates, CI and branch-rule boundary                |
| [Contributor instructions](../AGENTS.md)                      | Golden Rule and security invariants                           |
| [Changelog](../CHANGELOG.md)                                  | Commit/release evidence and limitations                       |

All maintained documentation is English; Portuguese UI copy and exact product
quotes retain their language. Source and migrations establish implementation;
a PR or green CI does not establish deployment. This increment consolidates the
approval/documentation work with Google identity, master management, tenant pages
and finite professional-led recurrence. Email delivery, recovery and Google
Calendar remain pending. No production release or remote migration is performed.
