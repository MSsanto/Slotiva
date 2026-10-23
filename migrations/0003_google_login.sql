-- Existing password sessions remain usable only while demo authentication is enabled.
ALTER TABLE sessions ADD COLUMN provider TEXT NOT NULL DEFAULT 'password'
  CHECK(provider IN ('password','google'));
ALTER TABLE sessions ADD COLUMN subject TEXT;
CREATE TABLE oauth_transactions (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_expiry ON oauth_transactions(expires_at);
CREATE TABLE oauth_attempts (
  client_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  started_at INTEGER NOT NULL
);
