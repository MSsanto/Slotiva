# ADR 011 — Separate Calendar consent and manual availability

Status: implemented, external configuration and hosted acceptance pending.
Date: 2026-10-22. This increment stops at a usable read-only connection and manual
primary-calendar availability lookup. It does not deliver event creation, attendee
invitations, external conflict enforcement or an outbox consumer.

## Boundary and authorization

Identity sign-in remains openid/email/profile. An authenticated Google professional
explicitly starts a second consent for openid and calendar.freebusy. Master and demo
password sessions cannot connect or query professional calendars. No account,
calendar identifier or tenant ID is accepted from the caller. Queries target only
the connected professional's primary calendar and return start/end intervals, never
event names, descriptions, attendees or other calendars. Only dates from today to
14 days ahead are accepted, using America/Sao_Paulo day boundaries.

The professional UI explains that Google intervals are for manual review: public
availability and confirmation still follow D1 occupancy alone. It must not imply
that external conflicts are enforced or that emails/events have been sent. The next
increment will implement confirmation/outbox processing with idempotent linked
events, provider failure handling and cancellation propagation.

## Credentials and lifecycle

Consent uses offline access, explicit consent/account choice, S256 PKCE, nonce and
a random ten-minute state. The state hash is bound to professional ID, immutable
Google subject and current session hash, consumed exactly once before exchange.
The returned OIDC signature/issuer/audience/expiry/nonce are checked using the same
cryptographic verifier as sign-in, without invitation binding or authorization
side effects. The subject must equal the authenticated professional. Missing
refresh credentials or freebusy scope fail closed; an existing connection survives
a failed replacement attempt.

Only refresh credentials are persisted, encrypted with AES-256-GCM and a random
96-bit IV. Authenticated associated data binds version, professional and Google
subject. The independent CALENDAR_TOKEN_KEY is a secret containing 32 random bytes
in standard base64. Access tokens are ephemeral server values and never sent to the
browser. Status responses expose only enabled/state/connectedAt/mode. Neither raw
provider errors nor tokens are returned/logged. OAuth transport uses bounded timeouts
and the native fetch wrapper, not an unbound dependency-object method.

Final connection storage rechecks the consumed transaction, active subject and
live session in the D1 batch. Disconnecting during exchange or logging out prevents
an in-flight callback from reconnecting. A per-connection generation protects a new
grant from stale refresh failures and suppresses in-flight results after disconnect.
Invalid refresh grants and decryption failures require reconnection. Provider HTTP,
per-calendar and malformed-response errors never become an empty/free result.

Disconnect deletes local credentials and outstanding consent transactions. It does
not revoke Google's shared application grant automatically; removing the app's
permission in Google Account is a distinct user action and can affect other scopes.
Suspending/removing a professional or changing their bound Google subject also
clears credentials/transactions. Resuming requires a new consent. Key replacement
requires all affected professionals to reconnect; retain the key securely rather
than regenerating it at every deployment. No silent fallback key exists.

## Setup and acceptance — owner action

1. Verify the same isolated Preview/PREVIEW_DB bindings described in
   [human validation](HUMAN_VALIDATION.md#editable-services--migration-0006),
   retaining a private backup. Apply migration 0008 before publishing matching
   code. This migration is additive and compatible with the previous Worker;
   the earlier quiet-window requirement concerned the 0006–0007 table rebuilds.
   Production and the older shared Preview remain untouched.
2. In the existing test Google Cloud project, enable Google Calendar API. Add the
   exact authorized redirect URI to the Web OAuth client (keep the identity one):
   https://feat-product-readiness-slotiva.matheus-sergio.workers.dev/api/admin/calendar/callback
3. Configure the consent screen/test users for calendar.freebusy. Identity sign-in
   alone grants no Calendar permission. The professional must personally approve
   the additional read-only scope. Google testing-mode grants can expire; confirm
   the account/project policies before a pilot.
4. With the Preview already using GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and
   PUBLIC_ORIGIN, create CALENDAR_TOKEN_KEY once through this PowerShell pipeline.
   It generates the key locally and pipes it directly to Wrangler's stdin without
   printing it into chat, configuration or Git:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" | npx wrangler preview secret put CALENDAR_TOKEN_KEY --name feat/product-readiness
```

5. Sign in as an active professional, then use /admin > Google Agenda > Conectar
   Google Agenda. Choose the same Google account. Confirm the panel reports
   connected. A master must not gain this access by visiting a professional URL.
6. Place a fictional occupied interval in that account's primary Google calendar.
   Query its date in Slotiva: verify the interval in Brasília time, then an empty
   date. No event title/details or customer records should appear in the panel.
7. Decline consent, select a different account, restart after an expired session,
   and retry a used callback: no unauthorized credential must be stored. A failed
   replacement must not overwrite a valid earlier connection.
8. Disconnect and verify queries stop. Reconnect, then remove the grant in Google
   Account and query: expect failure/reconnection, never false free availability.
   Suspend the professional and verify access is revoked; resume and reconnect.

Real Google consent, account permissions and real availability cannot be established
by local mocks or CI. No invitation or email should be expected in this increment.

Primary references: [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server),
[Calendar scopes](https://developers.google.com/workspace/calendar/api/auth),
[Freebusy query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query).
