# Human setup and acceptance — 0.5.0

This is a homologation handoff, not authorization to release to real customers.
Use fictional people and separate resources. The owner must complete account
console actions and validate real Google behavior; local tests cannot establish
those external settings. Do not merge into the Cloudflare-connected main branch
before coordinating the schema/code release.

## 1. Prepare isolated storage and the exact branch

Check out the PR branch, pull it and run npm ci. Read migrations 0002–0005 and
inspect `git status`. Never apply them to the older shared Preview database
77552831-ed97-4662-830a-2c7b318add96 or production while an old Worker writes.
Both this branch's Preview binding and old migration config are deliberately empty.

After authenticating Wrangler to the intended test account, create a NEW D1:

```powershell
npx wrangler login
npx wrangler d1 create slotiva-product-homologation
```

Review the returned ID. Put that new ID/name into both `wrangler.jsonc` under
`previews.d1_databases` (binding DB, migrations_dir migrations) and
`wrangler.preview-migrations.jsonc` under d1_databases (binding PREVIEW_DB,
migrations_dir migrations). Check that neither equals the old Preview or
production ID. Commit the reviewed configuration changes with a README/changelog
update. Do not paste database credentials or auth tokens into Git.

```powershell
npx wrangler d1 migrations apply PREVIEW_DB --remote --config ./wrangler.preview-migrations.jsonc
npx wrangler preview
```

The first command mutates ONLY the newly reviewed homologation D1. Do not use
npm run db:remote, which targets production. Confirm the displayed resource ID
before accepting any migration prompt. An empty config should fail, not choose
another database. Check `/api/health` after the Preview has its binding.

## 2. Configure Google and bootstrap a master

Create a separate Google OAuth Web client and consent configuration for testing.
Authorize test accounts. Register the exact stable Preview-origin callback
`https://<stable-preview-host>/api/admin/google/callback`; deployment-specific
unique URLs are unsuitable for a stable configured callback. Identity scopes
are openid/email/profile. Do not request Calendar scopes in this increment.

In the correct homologation/Preview environment, configure AUTH_MODE=google,
COOKIE_SECURE=true, PUBLIC_ORIGIN as the exact HTTPS origin without a trailing
slash, GOOGLE_CLIENT_ID, and secret GOOGLE_CLIENT_SECRET. Configure the secret
MASTER_GOOGLE_SUBS using the intended owner's verified immutable Google sub.
Use a trusted Google identity-verification process; do not obtain the subject
from unverified frontend decoding or a random token-inspection website. A master
subject is required before this app enables Google login; there is no public
bootstrap endpoint. Confirm how the Cloudflare dashboard scopes Preview secrets;
do not assume production secrets are inherited. Never paste tokens/secrets into
chat, PRs, logs or screenshots. Do not enable demo/password fallback to bypass setup.

These actions require access to the owner's Google/Cloudflare accounts and
selection of the authorized identity. They are the external human setup boundary.

## 3. Exercise roles and public profiles

- Sign in as the authorized master at `/master`; verify Google redirects there.
  An unrelated Google account must fail, and the password form must be absent.
- Create fictional professionals A and B with different email invitations/slugs
  and headers/themes. Use a verified Gmail/Workspace invitation or provision a
  trusted exact subject for another Google-account email domain.
- Open each `/p/{slug}`; check the correct header on desktop/mobile. The public
  profile response must not expose email, Google identity or appointment data.
- Sign in as A and B independently. Each sees only their own agenda/hours/profile.
  Changing B's booking ID in A's requests must not grant access; a master must not
  read professional appointment APIs.
- Edit A's header; B stays unchanged. Two screens editing the same old profile
  version must receive a conflict rather than silently overwriting each other.
- Suspend A: page hidden, old sessions revoked. Reactivate A: fresh login required.
  Delete a fictional profile with active bookings: page disappears, sessions are
  revoked, active bookings are cancelled and slots freed, historical rows/events
  remain. Confirm retired slugs cannot be registered again.

## 4. Practitioner workflow and public requests

With the psychologist, use fictional client identifiers. Confirm actual session
duration, break, working days, desired quantity/end and cancellation practice;
the current catalog/buffer are fixed and may require another increment.

Create 4 weekly encounters and 4 fortnightly encounters at a fixed time. Check
all dates, local time and the final date. Repeat a request after an ambiguous
network failure and verify no duplication. Arrange a conflicting later occurrence:
the whole new series must fail with no partial dates. Confirm public availability
hides those occupied intervals and another professional can still use that time.
Cancel one occurrence, then cancel the remaining future series. Verify released
slots and preserved history. Confirm no automatic renewal is expected.

Exercise a public request (>=48h, within 14 days), pending status/deadline,
professional approval/rejection, customer status polling and cancellation. At
24h a pending request expires and frees its hold; confirm Cron activation where
applicable. Pending edits keep the original deadline; confirmed rescheduling
returns the contact-professional instruction. Reload loses customer capability:
email recovery remains pending. No email or Calendar invite should be claimed.

Check keyboard focus, screen reader labels/errors, mobile overflow, contrast and
confirmation wording on master/profile/recurrence/booking screens. Verify Google
consent rejection, expired state, logout, blocked unauthorized identities and
session revocation in actual browsers.

## 5. Release gate and remaining work

Record the tested commit, isolated database ID, deployment URL, test accounts
without credentials, observed outcomes, practitioner decisions and open defects
in a GitHub acceptance issue/PR. Require passing Slotiva CI and Documentation
checks and human review. The observed main branch was unprotected on 2026-10-21;
configure repository rules requiring PRs, review and the displayed checks through
an account with administration rights. A CI workflow alone does not enforce merges.

Before real customers: implement and validate transactional email/recovery,
Calendar authorization/event/busy-time integration, safe delivery retries and
reconciliation; agree services and cancellation policies; establish public abuse
controls, retention/export/erasure, support, monitoring and a tested backup restore.
The proposed RPO 24h/RTO 4h are targets, not demonstrated guarantees.

For an eventual production release, authorize backups and a maintenance window,
pause old writers, apply reviewed additive migrations and deploy the matching
Worker, then validate before reopening. Never roll back only the Worker to an
incompatible schema. Prepare a compatible schema/data restoration plan. This
increment performs no production deploy or remote migration.
