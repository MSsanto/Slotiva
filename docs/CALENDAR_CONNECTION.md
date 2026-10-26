# Google Calendar connection

The professional connects Calendar separately from Google sign-in. Write-enabled access creates private primary-calendar events after confirmation,
requests Google invitations when an email is provided, and propagates Slotiva
cancellations. Old grants remain read-only until the professional authorizes again.
The panel also queries occupied intervals for today through +14 days.

Approval and professional series creation check Google availability. The public
slot list also excludes Google busy intervals, including the appointment buffer. Changes made directly in Google are not
imported: manage reservations in Slotiva.

## Implementation

Consent requests `openid`, `calendar.freebusy` and `calendar.events.owned`, with offline access, PKCE,
nonce and a ten-minute one-use state bound to the current session and professional.
The signed returned subject must match the account used in the panel. Master and
demo sessions cannot connect professional calendars.

Refresh tokens are encrypted with AES-256-GCM using an independent
`CALENDAR_TOKEN_KEY`. Associated data binds the token to the professional and
Google subject. Access tokens stay on the server and are not persisted.

Final storage rechecks the live session and active professional. Disconnect/logout
during exchange prevents the callback from reconnecting. A connection generation
also prevents an old refresh failure from invalidating a newer connection.

Disconnect removes stored credentials and pending transactions. Removing the
app's grant in Google Account is a separate action. Suspension, removal or a
changed Google subject also clears credentials. Invalid refresh grants require
reconnection. Provider errors never become an empty “free” result.

## Setup

1. Apply migrations through 0011 to the isolated Preview database using the
   [release procedure](OPERATIONS.md#preview-migrations-and-publication).
2. Enable Google Calendar API in the OAuth client's Google Cloud project.
3. Keep the identity callback and add this exact Calendar callback:

```text
https://feat-product-readiness-slotiva.matheus-sergio.workers.dev/api/admin/calendar/callback
```

4. Add the test accounts and free/busy and owned-event Calendar scopes to consent configuration.
5. Create the encryption key once. This PowerShell pipeline sends it directly
   to Wrangler without printing it:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" | npx wrangler preview secret put CALENDAR_TOKEN_KEY --name feat/product-readiness
```

Keep the key securely. Replacing it requires affected professionals to reconnect.
Publish matching Preview code and sign in as an active professional.

## Delivery

Migration 0011 queues existing future confirmations. New confirmations and
cancellations queue work in the same D1 transaction as the reservation. The
consumer processes at most three jobs per pass, with a 180-second claim lease,
booking-version checks, retry backoff (one minute through one hour) and fixed error
codes. It runs after API mutations and through the five-minute scheduled handler.
Previews must be checked for scheduled delivery support; **Sincronizar agora**
works without Cron and can be repeated to drain a larger queue.

The stable event ID is a SHA-256 digest of professional, Google subject and booking.
It is persisted before remote writes. A retry first reads that ID, so a lost insert
response does not create another event or deliberately resend invitations.
Cancellation deletes only an event carrying the matching private booking metadata,
using its ETag and `sendUpdates=all`. Series use one event per occurrence, so
cancelling one occurrence cannot delete the whole series. No clinical description,
service name, price or customer name is exported. An email, when present, is the
single attendee. Google notification delivery is requested, not independently
confirmed by Slotiva; recipient settings can affect invitations.

D1 and Google have no shared transaction. A conflict arising after approval leaves
the reservation confirmed and marks the Calendar job for review. A cancellation
racing with insert leaves a newer pending revision to remove that event on a later
pass. An already-started meeting not yet exported is skipped. External deletion
or unrelated event metadata is shown for review rather than overwritten. Jobs
already synchronized are not periodically audited for later Google edits.

Disconnect and professional suspension remove credentials, so queued remote
cancellations require reconnection with the original account. They do not promise
to remove Google events immediately. Never rotate the existing encryption key as
part of this upgrade.

## Preview acceptance

After applying 0011 and publishing the feature branch:

1. Add `https://www.googleapis.com/auth/calendar.events.owned` alongside the existing
   free/busy permission in Google Auth Platform > Data Access.
2. In Slotiva, use **Autorizar novamente Google Agenda**, choose the same account
   and grant both permissions. Existing read-only grants cannot write.
3. Use fictional bookings and a controlled recipient mailbox. Press **Sincronizar
   agora** and verify an existing future confirmation appears once at the correct
   Brasília time. Check the invitation in the recipient mailbox.
4. Repeat sync: no duplicate event. Cancel one occurrence: only that event should
   disappear, with the Google cancellation notification requested.
5. Create a busy Google event, then attempt approval and a series overlapping it:
   both must refuse with 409 and leave D1 unchanged. Also test an empty interval.
6. Revoke consent, retry and reconnect. Confirm visible pending/failure status and
   recovery. Verify larger queues drain and the deployed scheduled handler runs;
   use manual sync for Preview if Cron is unavailable.

## Test the connection

Use **Google Agenda > Conectar Google Agenda** and choose the same account used
in the panel. Create a fictional occupied interval in that account's primary
calendar, query its date and check the Brasília-time result. Also query an empty
date.

Test denied consent, wrong account, expired session, replayed callback,
disconnection and revoked Google permission. Failed replacement attempts must
preserve a previously working connection. Revoked or unavailable access must show
an error rather than claim the date is free.

The connection is still under Preview validation. Failed callbacks now include a
fixed `calendar_reason` and show guidance in the panel. Report that code rather
than provider responses or credentials.

| Code | Check |
| --- | --- |
| configuration | Preview OAuth values, origin and encryption key |
| transaction / session | Fresh consent in a live professional session |
| consent / scope | Complete consent and grant availability access |
| exchange_invalid_client | Matching client ID and secret |
| exchange_invalid_grant | Fresh attempt; verify callback if persistent |
| exchange_unauthorized_client | OAuth client type and allowed flow |
| exchange_redirect_uri_mismatch | Exact registered Calendar callback |
| exchange_invalid_request | Token request parameters |
| exchange_invalid_scope | Configured Calendar availability scope |
| exchange_unsupported_grant_type | OAuth grant type |
| exchange_unavailable | Network, timeout, rate limit or provider outage |
| exchange_redirect_blocked | Unexpected provider redirect, not followed |
| exchange | Unclassified provider refusal; inspect displayed HTTP status |
| grant | Required fields in the token response |
| identity / account | Valid signed identity matching the panel account |
| encryption / storage / internal | Server configuration, D1 and session state |

Codes identify the failure stage; they do not establish its root cause. The panel
also shows the provider HTTP status for failed exchanges. Raw response bodies,
descriptions, authorization codes and credentials are not displayed.

Calendar requests use manual redirects and reject non-success responses.
workerd does not support fetch redirect mode "error"; that option caused the
previous callback to fail before outbound I/O. The native-runtime regression
checks token parameters, PKCE, one-use state and blocked redirects.

References: [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server),
[Calendar scopes](https://developers.google.com/workspace/calendar/api/auth),
[Freebusy query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query).

Event references: [Insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert),
[Delete](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete),
[Resource versions](https://developers.google.com/workspace/calendar/api/guides/version-resources).
