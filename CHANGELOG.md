# Changelog

## Unreleased

- Splits the professional agenda into Hoje, Futuros, Cancelados and Histórico.
  Uses Brasília dates, updates at midnight and keeps past/cancelled rows read-only.

- Fixes Calendar transport failing before network I/O: workerd requires manual
  redirects instead of the unsupported error mode. Unexpected redirects are rejected.
- Distinguishes provider request/scope errors, outages and HTTP status in safe
  Calendar diagnostics, with native workerd regression coverage.

- Adds deleted-profile listing and restoration for the master. Original identity
  and history are retained; cancelled bookings and revoked sessions stay unchanged.
- Adds migration 0010 for restoration lifecycle guards and audit events.
- Resets the creation form after success and places creation errors by the submit button.

- Adds optional professional WhatsApp contact settings and a public contact link
  on booking pages and receipts. Hidden by default; uses a neutral message.
- Adds migration 0009 for per-professional contact number and visibility.

- Simplified project documentation and contribution guidance.
- Consolidated architecture and operations notes; kept historical development
  notes in Git history.
- Replaced mandatory document-touch rules with a Markdown link check.

## 0.5.0 — In development

- Google sign-in with separate master and professional roles.
- Professional invitations, public pages, editable branding and working hours.
- Professional-owned service catalogs with optional duration and paid amount.
- Booking snapshots preserve agreed terms after catalog edits.
- Finite single, weekly and fortnightly appointments entered by professionals.
- Explicit cancellation of one occurrence or all future encounters in a series.
- Separate agenda and cancelled-history views.
- Separate read-only Calendar consent, encrypted refresh credentials and manual
  primary-calendar availability lookup.
- Login and Calendar callback diagnostics; native Worker fetch transport fix.

Calendar consent is still being validated in Preview. Automatic external conflict
checks, Calendar events, invitations and transactional delivery are pending.

### Database changes

| Migration | Change |
| --- | --- |
| 0003 | Google identity and sessions |
| 0004 | Professional ownership and public pages |
| 0005 | Finite agreed series |
| 0006 | Service catalogs and booking snapshots |
| 0007 | Optional catalog duration and paid amount |
| 0008 | Calendar connections and consent transactions |

Migrations 0006–0007 rebuild booking tables and require a coordinated deployment.

## 0.4.0 — Approval workflow

- Public requests require 48-hour notice and professional approval within 24 hours.
- Expired, rejected and cancelled requests release held time.
- Version checks protect decisions and pending edits.

Earlier implementation details and validation runs remain in commit and CI history.
