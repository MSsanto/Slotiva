CREATE TABLE email_jobs (
 id TEXT PRIMARY KEY,
 professional_id TEXT NOT NULL REFERENCES professionals(id),
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('requested','confirmed','cancelled','rejected','expired','recovery')),
 booking_version INTEGER NOT NULL,
 body_encrypted TEXT,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','failed','expired')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt INTEGER NOT NULL DEFAULT 0,
 lease TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 expires_at INTEGER NOT NULL DEFAULT (unixepoch()+82800),
 accepted_at INTEGER,
 provider_id TEXT
);
CREATE INDEX email_jobs_due ON email_jobs(state,next_attempt,lease_until);
CREATE TABLE recovery_limits (
 bucket TEXT PRIMARY KEY,
 attempts INTEGER NOT NULL DEFAULT 1,
 expires_at INTEGER NOT NULL
);
CREATE TRIGGER queue_booking_email AFTER INSERT ON bookings WHEN NEW.email!='' BEGIN
 INSERT INTO email_jobs(id,professional_id,booking_id,kind,booking_version) VALUES(NEW.id||':'||NEW.version||':'||NEW.status,NEW.professional_id,NEW.id,CASE WHEN NEW.status='pending_approval' THEN 'requested' ELSE 'confirmed' END,NEW.version);
END;
CREATE TRIGGER queue_booking_status_email AFTER UPDATE OF status ON bookings WHEN OLD.status!=NEW.status AND NEW.email!='' BEGIN
 INSERT INTO email_jobs(id,professional_id,booking_id,kind,booking_version) VALUES(NEW.id||':'||NEW.version||':'||NEW.status,NEW.professional_id,NEW.id,NEW.status,NEW.version);
END;
ALTER TABLE customer_links ADD COLUMN email_hash TEXT;
CREATE TABLE verified_booking_contacts (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
 email_hash TEXT NOT NULL,
 verified_at INTEGER NOT NULL DEFAULT (unixepoch())
);
