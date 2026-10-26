# Google Calendar connection

The professional connects Calendar separately from Google sign-in. Current access
is read-only: the panel shows occupied intervals in the account's primary calendar
for today through the next 14 days, in Brasília time.

Public availability and booking confirmation do not yet use these intervals.
Event creation, invitations and automatic conflict checks are pending.

## Implementation

Consent requests `openid` and `calendar.freebusy`, with offline access, PKCE,
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

1. Apply migration 0008 to the isolated Preview database using the
   [release procedure](OPERATIONS.md#preview-migrations-and-publication).
2. Enable Google Calendar API in the OAuth client's Google Cloud project.
3. Keep the identity callback and add this exact Calendar callback:

```text
https://feat-product-readiness-slotiva.matheus-sergio.workers.dev/api/admin/calendar/callback
```

4. Add the test accounts and read-only Calendar scope to consent configuration.
5. Create the encryption key once. This PowerShell pipeline sends it directly
   to Wrangler without printing it:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" | npx wrangler preview secret put CALENDAR_TOKEN_KEY --name feat/product-readiness
```

Keep the key securely. Replacing it requires affected professionals to reconnect.
Publish matching Preview code and sign in as an active professional.

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
