CREATE TABLE customer_grants (
 session_hash TEXT NOT NULL,
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,
 PRIMARY KEY(session_hash,booking_id)
);
CREATE INDEX customer_grants_expiry ON customer_grants(expires_at);
CREATE TABLE customer_links (
 token_hash TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX customer_links_expiry ON customer_links(expires_at);
