# Operations

## Environments

Local development uses Wrangler's local D1 and `.dev.vars`. Preview uses
`slotiva-product-homologation`, separate from production and the older shared
Preview database.

Preview `DB` in `wrangler.jsonc` and `PREVIEW_DB` in
`wrangler.preview-migrations.jsonc` must point to the same database:
`74b37b6b-7f9e-40a3-b685-546d7a0a76ac`. Verify both before a remote migration.
Do not use `npm run db:remote` for Preview.

## Google sign-in

Use a Google OAuth **Web application** client and configure test users in the
Google Auth platform. The identity callback is:

```text
https://feat-product-readiness-slotiva.matheus-sergio.workers.dev/api/admin/google/callback
```

| Setting | Value |
| --- | --- |
| AUTH_MODE | google |
| COOKIE_SECURE | true |
| PUBLIC_ORIGIN | Stable HTTPS origin, no trailing slash |
| GOOGLE_CLIENT_ID | Public Web application client ID |
| GOOGLE_CLIENT_SECRET | Matching client secret |
| MASTER_GOOGLE_SUBS | Authorized immutable Google subjects |
| CALENDAR_TOKEN_KEY | Separate 32-byte base64 key; see Calendar setup |

Store secrets in the named Preview using interactive prompts:

```powershell
npx wrangler preview secret put GOOGLE_CLIENT_SECRET --name feat/product-readiness
npx wrangler preview secret put MASTER_GOOGLE_SUBS --name feat/product-readiness
```

`MASTER_GOOGLE_SUBS` contains the intended account's verified `sub`, not its
email or client ID. Obtain it through a verified Google identity flow. One option
is Google's OAuth Playground with its default client, `openid email` scopes,
and a GET to `https://openidconnect.googleapis.com/v1/userinfo`. Check the
returned verified email, copy only the subject to the secret prompt and revoke
the Playground grant afterwards. Keep all tokens within the provider tool.

After publication, `/api/auth/config` should return `googleEnabled=true` and
`passwordEnabled=false`. Then test an authorized login and an unrelated account.

## Preview migrations and publication

Migrations 0006–0007 rebuild bookings. Stop old Preview writers during the
migration and publish matching code before reopening. Back up privately first;
if the current environment cannot be stopped, use a new isolated database.

```powershell
git switch feat/product-readiness
git pull --ff-only
npm ci
npx wrangler d1 info PREVIEW_DB --config ./wrangler.preview-migrations.jsonc
npx wrangler d1 export PREVIEW_DB --remote --config ./wrangler.preview-migrations.jsonc --output "$env:TEMP/slotiva-backup.sql"
npx wrangler d1 migrations apply PREVIEW_DB --remote --config ./wrangler.preview-migrations.jsonc
npx wrangler preview
Invoke-RestMethod "https://feat-product-readiness-slotiva.matheus-sergio.workers.dev/api/health"
```

Run the mutation commands only after checking the database and backup. If a
migration fails, investigate before publishing. If publication fails after a
successful migration, keep writes stopped and retry the matching version.
Rolling back only the Worker may leave it incompatible with the database.

`main` is connected to Cloudflare Builds. Production release needs its own
backup, migration and deployment window.

## WhatsApp contact rollout

Apply additive migration 0009 to the isolated Preview database before publishing
the matching Worker. Existing profiles default to hidden contact; previous Worker
versions can ignore these new columns. The health probe now checks both columns.

In /admin > Contato pelo WhatsApp, save a number with country code and enable
publication. Check the public link and its neutral message, then disable it and
verify the contact disappears. Repeat with two professional pages to check
ownership. Phone formatting is validated; the professional must check that the
destination is their intended WhatsApp account.

## Restoring deleted accounts

Apply migration 0010 before publishing the restoration UI/API. It replaces
lifecycle triggers without rewriting stored profiles or bookings. The older
Worker remains compatible, but cannot offer restoration.

In /master, open Excluídos and restore a fictional account. Confirm its public
page returns under the original slug, the same Google identity can sign in again,
old sessions remain rejected, cancelled reservations remain cancelled and
Calendar stays disconnected. Check that WhatsApp publication is hidden.
Dismissing the confirmation must leave the account deleted. A stale restore
request must fail without an extra audit event.

## Acceptance checks

Use fictional customers and two professional accounts.

- Master: create, suspend, reactivate and remove a professional. Verify a master
  cannot read professional appointment endpoints.
- Ownership: each professional sees only their own data. Substituting another
  professional's booking or series ID must fail.
- Public request: check 48-hour notice, approval/rejection, 24-hour expiry,
  customer receipt and released availability after cancellation.
- Services: edit terms after a booking; existing terms must remain unchanged.
  Blank duration/paid amount must mean “to be agreed”, not zero or free.
- Recurrence: create weekly and fortnightly series, retry without duplication,
  and force a conflict on a later occurrence to check full rollback.
- Cancellation: cancel one occurrence, then all future encounters. Check preserved
  history, released intervals and dismissal of confirmation dialogs.
- Access: reject unrelated Google accounts, logout, expire a session and check
  revocation after suspension.
- UI: check keyboard focus, labels, confirmations and mobile overflow.
- Calendar: follow [connection checks](CALENDAR_CONNECTION.md).

Before a pilot, complete the remaining [roadmap](ROADMAP.md) requirements and
restore a backup into an isolated database.

## Login troubleshooting

A failed login redirects to `/admin?google=failed&reason=...`. Share the final
reason, not the OAuth callback URL containing `code` or `state`.

| Reason | Check |
| --- | --- |
| configuration | Required environment values and Preview secret scope |
| origin | Start from the stable PUBLIC_ORIGIN |
| transaction | Restart in one tab; check cookie blocking and expiry |
| exchange_invalid_client | Matching client ID and secret |
| exchange_invalid_grant | Fresh code, exact callback and PKCE |
| exchange_unauthorized_client | Web client type and allowed flow |
| exchange_redirect_uri_mismatch | Registered callback |
| exchange_invalid_request | Token request parameters |
| exchange_unavailable | Provider/network/rate-limit availability |
| exchange | Unclassified or malformed token response |
| identity | Signature, audience, nonce and provider key availability |
| authorization | Intended subject, master allowlist or professional invitation |
| session / internal | D1 schema and server failure |

The health endpoint checks the application schema. It does not test OAuth or
external delivery. Test outcomes belong in the relevant issue or PR, not in this
setup guide.

## Enable application email

Google invitations work independently. For recovery and Slotiva status messages,
verify a sending domain in Resend, then configure EMAIL_FROM as a bare address on
that domain and EMAIL_ENABLED=true. Store EMAIL_API_KEY as a Preview secret.
Create EMAIL_TOKEN_KEY once using the same 32-byte base64 generation procedure
as CALENDAR_TOKEN_KEY, with the new secret name; do not reuse or rotate the Calendar
key. Email bodies containing recovery links are encrypted with this separate key.
Apply migration 0015 before publishing this code. Never put real keys in Git.

Keep sending disabled until the provider domain is verified. Use a controlled
recipient mailbox to validate recovery, expiry, bounce handling and provider
acceptance. The panel does not claim inbox delivery; inspect provider delivery
logs for acceptance/bounce diagnostics. Failed/expired jobs are visible separately
from booking status. Cron and post-mutation execution drain bounded batches; the
panel also offers a manual retry. If Cron is unavailable in Preview, explicitly
exercise that action. Do not replay jobs beyond their expiry or rotate the email
key while unaccepted encrypted jobs remain.

Provider references: [Send email](https://resend.com/docs/api-reference/emails/send-email),
[Idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
