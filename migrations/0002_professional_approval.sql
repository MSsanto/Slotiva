-- Preserve existing reservations, then enforce approval for every new request.
ALTER TABLE bookings ADD COLUMN status TEXT NOT NULL DEFAULT 'pending_approval'
  CHECK(status IN ('pending_approval','confirmed','rejected','expired','cancelled'));
ALTER TABLE bookings ADD COLUMN approval_expires_at INTEGER;
ALTER TABLE bookings ADD COLUMN decided_at INTEGER;
ALTER TABLE bookings ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
UPDATE bookings SET status=CASE WHEN cancelled=1 THEN 'cancelled' ELSE 'confirmed' END;
CREATE INDEX bookings_pending_expiry ON bookings(status,approval_expires_at);
CREATE TABLE booking_events (
  id INTEGER PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  occurred_at INTEGER NOT NULL DEFAULT (unixepoch()),
  version INTEGER NOT NULL
);
-- Durable intent only. No sender consumes these jobs until email/Calendar is implemented.
CREATE TABLE notification_outbox (
  id INTEGER PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  kind TEXT NOT NULL CHECK(kind IN ('confirmed','rejected','expired','cancelled')),
  booking_version INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'awaiting_integration' CHECK(state IN ('awaiting_integration','sent','failed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(booking_id,kind,booking_version)
);
CREATE TRIGGER approval_insert BEFORE INSERT ON bookings
BEGIN
  SELECT CASE WHEN NEW.status!='pending_approval' OR NEW.cancelled!=0
    OR NEW.approval_expires_at IS NULL OR NEW.approval_expires_at!=NEW.created_at+86400
    OR NEW.created_at!=unixepoch() OR NEW.version!=1
    THEN RAISE(ABORT,'INVALID_TRANSITION') END;
  SELECT CASE WHEN NEW.starts_at<unixepoch()+172800 THEN RAISE(ABORT,'MINIMUM_NOTICE') END;
END;
CREATE TRIGGER approval_update BEFORE UPDATE ON bookings
BEGIN
  SELECT CASE WHEN NEW.created_at!=OLD.created_at
    OR NEW.approval_expires_at IS NOT OLD.approval_expires_at
    OR NEW.version!=OLD.version+1
    OR NEW.cancelled!=CASE WHEN NEW.status IN ('pending_approval','confirmed') THEN 0 ELSE 1 END
    THEN RAISE(ABORT,'INVALID_TRANSITION') END;
  SELECT CASE WHEN NOT (
    (OLD.status='pending_approval' AND NEW.status='pending_approval' AND OLD.approval_expires_at>unixepoch())
    OR (OLD.status='pending_approval' AND NEW.status IN ('confirmed','rejected','cancelled') AND OLD.approval_expires_at>unixepoch())
    OR (OLD.status='pending_approval' AND NEW.status='expired' AND OLD.approval_expires_at<=unixepoch())
    OR (OLD.status='confirmed' AND NEW.status='cancelled')
  ) THEN RAISE(ABORT,'INVALID_TRANSITION') END;
  -- Never move a confirmed reservation through the old immediate-move API.
  SELECT CASE WHEN (NEW.date!=OLD.date OR NEW.start_min!=OLD.start_min) AND
    (OLD.status!='pending_approval' OR NEW.status!='pending_approval')
    THEN RAISE(ABORT,'INVALID_TRANSITION') END;
  SELECT CASE WHEN (NEW.date!=OLD.date OR NEW.start_min!=OLD.start_min)
    AND NEW.starts_at<unixepoch()+172800 THEN RAISE(ABORT,'MINIMUM_NOTICE') END;
END;
CREATE TRIGGER record_booking_transition AFTER UPDATE ON bookings WHEN OLD.status!=NEW.status
BEGIN
  INSERT INTO booking_events(booking_id,from_status,to_status,version)
    VALUES(NEW.id,OLD.status,NEW.status,NEW.version);
  INSERT INTO notification_outbox(booking_id,kind,booking_version)
    VALUES(NEW.id,NEW.status,NEW.version);
END;
