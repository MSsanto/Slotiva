-- Finite, professional-entered agreements. No background infinite recurrence.
CREATE TABLE booking_series (
  id TEXT PRIMARY KEY,
  professional_id TEXT NOT NULL REFERENCES professionals(id),
  request_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK(frequency IN ('once','weekly','fortnightly')),
  occurrence_count INTEGER NOT NULL CHECK(occurrence_count BETWEEN 1 AND 26),
  actor_subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(professional_id,request_id)
);
ALTER TABLE bookings ADD COLUMN source TEXT NOT NULL DEFAULT 'public' CHECK(source IN ('public','professional'));
ALTER TABLE bookings ADD COLUMN series_id TEXT REFERENCES booking_series(id);
CREATE INDEX bookings_series ON bookings(series_id,starts_at);
DROP TRIGGER approval_insert;
CREATE TRIGGER approval_insert BEFORE INSERT ON bookings
BEGIN
  SELECT CASE WHEN NEW.created_at!=unixepoch() OR NEW.version!=1 OR NEW.cancelled!=0
    THEN RAISE(ABORT,'INVALID_TRANSITION') END;
  SELECT CASE WHEN NEW.source='public' AND (NEW.status!='pending_approval' OR NEW.series_id IS NOT NULL
    OR NEW.approval_expires_at IS NULL OR NEW.approval_expires_at!=NEW.created_at+86400)
    THEN RAISE(ABORT,'INVALID_TRANSITION') END;
  SELECT CASE WHEN NEW.source='public' AND NEW.starts_at<unixepoch()+172800
    THEN RAISE(ABORT,'MINIMUM_NOTICE') END;
  SELECT CASE WHEN NEW.source='professional' AND (NEW.status!='confirmed' OR NEW.approval_expires_at IS NOT NULL
    OR NEW.decided_at IS NULL OR NEW.starts_at<=unixepoch() OR NOT EXISTS(
      SELECT 1 FROM booking_series WHERE id=NEW.series_id AND professional_id=NEW.professional_id AND status='active'))
    THEN RAISE(ABORT,'INVALID_TRANSITION') END;
END;
CREATE TRIGGER guard_booking_source BEFORE UPDATE ON bookings
BEGIN
  SELECT CASE WHEN NEW.source!=OLD.source OR NEW.series_id IS NOT OLD.series_id
    THEN RAISE(ABORT,'INVALID_TRANSITION') END;
END;
CREATE TRIGGER record_manual_booking AFTER INSERT ON bookings WHEN NEW.source='professional'
BEGIN
  INSERT INTO booking_events(booking_id,from_status,to_status,version) VALUES(NEW.id,'agreed','confirmed',NEW.version);
  INSERT INTO notification_outbox(booking_id,kind,booking_version) VALUES(NEW.id,'confirmed',NEW.version);
END;
