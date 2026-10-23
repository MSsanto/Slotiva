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
