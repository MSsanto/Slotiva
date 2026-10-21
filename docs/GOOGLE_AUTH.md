# ADR 008 — Google identity and independent authorization

Status: implemented and tested with signed synthetic tokens; real OAuth client,
consent and hosted session validation await [human setup](HUMAN_VALIDATION.md).

## Decision

Use Google's server-side OpenID Connect authorization-code flow in the Worker,
with jose verifying signatures against fixed Google HTTPS JWKS. This is the
server-side alternative to the originally proposed browser GIS integration.
Only openid/email/profile are requested; Google sign-in grants no Calendar access.
No Google access or refresh token is persisted or exposed to the browser.

A canonical PUBLIC_ORIGIN fixes the callback. Start requires the exact Origin
and host, independent random state/browser binding/nonce and PKCE. D1 stores
hashed state/browser binding and ephemeral verifier/nonce with a ten-minute
expiry. Atomic DELETE RETURNING consumes the transaction once; another browser,
expired state, replay or concurrent callback cannot create a second session.
Failed exchanges require restarting sign-in. Starts are limited to ten per IP
per 15 minutes. Fixed token exchange times out after eight seconds.

Verify RS256 signature, trusted issuer, client audience, required sub/iat/exp/
nonce, maximum token age ten minutes and azp when supplied or required for
multiple audiences. Never authorize from unverified decoding, an arbitrary
JWKS URL or an email supplied by the frontend. Rotate own session on success;
store only its SHA-256 hash, provider, subject, role, tenant and eight-hour expiry.
Cookie: HttpOnly, SameSite=Lax, path /api, Secure when hosted. Clear old admin-path
cookies and the transaction cookie. Redirect only to fixed /master or /admin;
errors to /admin?google=failed. OAuth responses use no-referrer; logs never contain
codes, tokens or state. Platform request logging needs separate review.

## Roles and invitations

MASTER_GOOGLE_SUBS is a comma-separated secret list of immutable Google subjects
for master administrators. There is no default master password, public master
registration or first-user-wins bootstrap. Master access manages profiles only;
it cannot read tenant appointment routes. Removing a master subject invalidates
its sessions on the next protected request.

The master provisions a professional's unique email invitation and optional
explicit Google subject. On first login, an unbound invitation may bind to the
signed ID token only when email_verified is true and Google is authoritative
(Gmail or a Workspace hd claim). An email on a third-party-domain Google account
requires explicit verified subject provisioning. After binding, only the immutable
subject authorizes access; subsequent email changes do not silently reassign it.
One subject maps to one professional. Reusing emails or retired slugs is rejected.
Professional suspension/deletion revokes sessions immediately in D1 and active
status is checked again on every protected request. Changing roles requires a
new session. Valid Google authentication without authorization grants no access.

AUTH_MODE=google rejects password login and existing password sessions.
Demo/unset retains isolated legacy demo behavior; unknown modes close passwords.
The Google button appears only with complete validated configuration. Never turn
on demo mode to bypass a real Google authorization failure.

## Configuration and evidence

PUBLIC_ORIGIN must be an HTTPS origin without path/query or credentials. Local
HTTP is allowed only with COOKIE_SECURE=false and localhost/127.0.0.1. Set
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and MASTER_GOOGLE_SUBS in the environment;
secrets must never enter source, chat or screenshots. Use distinct OAuth clients
and D1 resources for homologation and production. Migration 0003 adds provenance
and ephemeral OAuth state; 0004 adds roles and tenant ownership.

Tests use generated RSA keys, genuine JWT verification and an in-process mock of
the code exchange, with no production environment flag to disable verification.
They cover valid/forged/expired/wrong issuer/audience/nonce/azp identities,
state/browser replay, failed exchange, session rotation and authorization changes.
These tests do not replace real consent, Google-account selection, callback host,
HTTPS cookies, revocation and authorized/unauthorized account checks.

Primary references:
[Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect),
[server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[ID-token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token),
[jose](https://github.com/panva/jose).
