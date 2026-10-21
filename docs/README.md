# Slotiva documentation

- [Approval workflow and rollout](APPROVAL_WORKFLOW.md): implemented states,
  deadlines, endpoints, regression evidence and coordinated release procedure.
- [Product requirements v1](SLOTIVA_DOCUMENTACAO_PRODUTO_V1.md): original Portuguese
  requirements and decisions; describes target behavior, not proof of readiness.
- [Contributor instructions and Golden Rule](../AGENTS.md).
- [Change history](../CHANGELOG.md).
- [Project README](../README.md): currently implemented application and local setup.

## Current implementation

Version 0.4.0 implements pending requests, professional approval/rejection and
expiration with 48-hour notice and 24-hour approval limits for one professional.
The backend uses React/TypeScript, Workers and D1, administrative password
sessions and an in-memory customer capability token. SQL triggers protect
occupied intervals and transactional state changes. The approval runbook records
current evidence and limits; the older product specification describes planned
identity, Calendar, email recovery, recurring appointments and tenant isolation.

All newly maintained implementation documentation is written in English.
Historical Portuguese requirements/changelog entries retain their provenance.
Portuguese application copy and quoted product text are independent of the
repository documentation language. Do not present requirements as delivered
capabilities or claim full accessibility/security/pilot readiness from green CI.

PR #1 contains a separate documentation gate and isolated Preview setup. Those
changes are not assumed merged. Coordinate both PRs and database compatibility
before publishing approval code to any previously deployed demo.
