-- Existing free/busy grants must be explicitly upgraded before writing events.
ALTER TABLE calendar_connections ADD COLUMN can_write INTEGER NOT NULL DEFAULT 0 CHECK(can_write IN (0,1));
CREATE TABLE calendar_jobs (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
 revision INTEGER NOT NULL,
 synced_revision INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','synced','skipped','failed','conflict')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt INTEGER NOT NULL DEFAULT 0,
 lease TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0,
 subject TEXT,
 event_id TEXT,
 last_error TEXT CHECK(last_error IN ('provider','conflict','connection','event_changed') OR last_error IS NULL),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX calendar_jobs_due ON calendar_jobs(state,next_attempt,lease_until);
CREATE TRIGGER calendar_confirmed_insert AFTER INSERT ON bookings WHEN NEW.status='confirmed'
BEGIN
 INSERT INTO calendar_jobs(booking_id,revision) VALUES(NEW.id,NEW.version);
END;
CREATE TRIGGER calendar_booking_transition AFTER UPDATE ON bookings WHEN NEW.status='confirmed' OR OLD.status='confirmed'
BEGIN
 INSERT INTO calendar_jobs(booking_id,revision) VALUES(NEW.id,NEW.version)
 ON CONFLICT(booking_id) DO UPDATE SET revision=excluded.revision,state='pending',next_attempt=0,attempts=0,last_error=NULL,updated_at=unixepoch();
END;
INSERT INTO calendar_jobs(booking_id,revision)
 SELECT id,version FROM bookings WHERE status='confirmed' AND starts_at>unixepoch();
