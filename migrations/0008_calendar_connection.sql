-- Read-only Google Calendar consent is separate from identity sign-in.
CREATE TABLE calendar_connections (
 professional_id TEXT PRIMARY KEY REFERENCES professionals(id),
 subject TEXT NOT NULL,
 encrypted_refresh_token TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'connected' CHECK(state IN ('connected','reconnect_required')),
 generation TEXT NOT NULL,
 connected_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE calendar_oauth_transactions (
 state_hash TEXT PRIMARY KEY,
 professional_id TEXT NOT NULL REFERENCES professionals(id),
 subject TEXT NOT NULL,
 session_hash TEXT NOT NULL,
 nonce TEXT NOT NULL,
 verifier TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed IN (0,1))
);
CREATE INDEX calendar_oauth_expiry ON calendar_oauth_transactions(expires_at);
CREATE TRIGGER invalidate_calendar_connection AFTER UPDATE OF status,google_subject ON professionals
WHEN NEW.status!='active' OR NEW.google_subject IS NOT OLD.google_subject
BEGIN
 DELETE FROM calendar_connections WHERE professional_id=NEW.id;
 DELETE FROM calendar_oauth_transactions WHERE professional_id=NEW.id;
END;
