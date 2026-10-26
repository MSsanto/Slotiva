CREATE TABLE date_hours (
 professional_id TEXT NOT NULL REFERENCES professionals(id),
 date TEXT NOT NULL CHECK(date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 opens INTEGER NOT NULL CHECK(opens>=0 AND opens%30=0),
 closes INTEGER NOT NULL CHECK(closes<=1440 AND closes%30=0 AND closes>opens),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(professional_id,date)
);
DROP TRIGGER validate_booking_insert;
CREATE TRIGGER validate_booking_insert BEFORE INSERT ON bookings WHEN NEW.cancelled=0
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM professionals WHERE id=NEW.professional_id AND status='active')
    THEN RAISE(ABORT,'PROFESSIONAL_UNAVAILABLE') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM date_hours WHERE professional_id=NEW.professional_id AND date=NEW.date AND enabled=1 AND NEW.start_min>=opens AND NEW.occupied_until<=closes)
    AND (EXISTS(SELECT 1 FROM date_hours WHERE professional_id=NEW.professional_id AND date=NEW.date) OR NOT EXISTS(SELECT 1 FROM weekly_hours WHERE professional_id=NEW.professional_id AND weekday=NEW.weekday AND enabled=1 AND NEW.start_min>=opens AND NEW.occupied_until<=closes))
    THEN RAISE(ABORT,'OUTSIDE_HOURS') END;
END;
DROP TRIGGER validate_booking_update;
CREATE TRIGGER validate_booking_update BEFORE UPDATE ON bookings
BEGIN
  SELECT CASE WHEN NEW.professional_id!=OLD.professional_id THEN RAISE(ABORT,'INVALID_TRANSITION') END;
  SELECT CASE WHEN NEW.cancelled=0 AND NOT EXISTS(SELECT 1 FROM professionals WHERE id=NEW.professional_id AND status='active')
    THEN RAISE(ABORT,'PROFESSIONAL_UNAVAILABLE') END;
  SELECT CASE WHEN NEW.cancelled=0 AND NOT EXISTS(SELECT 1 FROM date_hours WHERE professional_id=NEW.professional_id AND date=NEW.date AND enabled=1 AND NEW.start_min>=opens AND NEW.occupied_until<=closes)
    AND (EXISTS(SELECT 1 FROM date_hours WHERE professional_id=NEW.professional_id AND date=NEW.date) OR NOT EXISTS(SELECT 1 FROM weekly_hours WHERE professional_id=NEW.professional_id AND weekday=NEW.weekday AND enabled=1 AND NEW.start_min>=opens AND NEW.occupied_until<=closes))
    THEN RAISE(ABORT,'OUTSIDE_HOURS') END;
END;
CREATE TRIGGER protect_date_hours_insert AFTER INSERT ON date_hours BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE professional_id=NEW.professional_id AND date=NEW.date AND cancelled=0 AND starts_at>unixepoch() AND (NEW.enabled=0 OR start_min<NEW.opens OR occupied_until>NEW.closes)) THEN RAISE(ABORT,'EXISTING_BOOKINGS') END;
END;
CREATE TRIGGER protect_date_hours_update AFTER UPDATE ON date_hours BEGIN
 SELECT CASE WHEN NEW.professional_id!=OLD.professional_id OR NEW.date!=OLD.date OR NEW.version!=OLD.version+1 THEN RAISE(ABORT,'INVALID_TRANSITION') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE professional_id=NEW.professional_id AND date=NEW.date AND cancelled=0 AND starts_at>unixepoch() AND (NEW.enabled=0 OR start_min<NEW.opens OR occupied_until>NEW.closes)) THEN RAISE(ABORT,'EXISTING_BOOKINGS') END;
END;
CREATE TRIGGER protect_date_hours_delete BEFORE DELETE ON date_hours BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings b WHERE b.professional_id=OLD.professional_id AND b.date=OLD.date AND b.cancelled=0 AND b.starts_at>unixepoch() AND NOT EXISTS(SELECT 1 FROM weekly_hours w WHERE w.professional_id=b.professional_id AND w.weekday=b.weekday AND w.enabled=1 AND b.start_min>=w.opens AND b.occupied_until<=w.closes)) THEN RAISE(ABORT,'EXISTING_BOOKINGS') END;
END;
DROP TRIGGER protect_existing_bookings;
CREATE TRIGGER protect_existing_bookings AFTER UPDATE ON weekly_hours BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings b WHERE b.professional_id=NEW.professional_id AND b.cancelled=0 AND b.weekday=NEW.weekday AND b.starts_at>=unixepoch() AND NOT EXISTS(SELECT 1 FROM date_hours d WHERE d.professional_id=b.professional_id AND d.date=b.date) AND (NEW.enabled=0 OR b.start_min<NEW.opens OR b.occupied_until>NEW.closes)) THEN RAISE(ABORT,'EXISTING_BOOKINGS') END;
END;
