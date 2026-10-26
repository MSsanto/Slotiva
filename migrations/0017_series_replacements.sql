CREATE TABLE series_replacements (
 replacement_id TEXT PRIMARY KEY REFERENCES booking_series(id),
 original_series_id TEXT NOT NULL REFERENCES booking_series(id),
 original_booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 professional_id TEXT NOT NULL REFERENCES professionals(id),
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TRIGGER validate_series_replacement BEFORE INSERT ON series_replacements BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM booking_series s JOIN bookings b ON b.series_id=NEW.original_series_id AND b.professional_id=NEW.professional_id WHERE s.id=NEW.replacement_id AND s.professional_id=NEW.professional_id AND b.id=NEW.original_booking_id AND b.status='confirmed' AND b.starts_at>unixepoch()) THEN RAISE(ABORT,'INVALID_TRANSITION') END;
END;
DROP TRIGGER validate_booking_service;
CREATE TRIGGER validate_booking_service BEFORE INSERT ON bookings BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM professional_services s WHERE s.professional_id=NEW.professional_id AND s.id=NEW.service_id AND s.active=1
 AND s.version=NEW.service_version AND s.name=NEW.service_name AND s.description=NEW.service_description
 AND ((s.duration_minutes IS NULL AND NEW.source='professional') OR s.duration_minutes=NEW.service_duration) AND s.price_mode=NEW.service_price_mode AND s.price_cents IS NEW.service_price_cents)
 AND NOT (NEW.source='professional' AND EXISTS(SELECT 1 FROM bookings b WHERE b.professional_id=NEW.professional_id AND b.service_id=NEW.service_id AND b.service_name=NEW.service_name AND b.service_description=NEW.service_description AND b.service_duration=NEW.service_duration AND b.service_price_mode=NEW.service_price_mode AND b.service_price_cents IS NEW.service_price_cents AND b.service_version=NEW.service_version
 AND (EXISTS(SELECT 1 FROM booking_changes c WHERE c.booking_id=b.id AND c.replacement_id=NEW.id AND c.professional_id=NEW.professional_id AND c.state='approved')
 OR EXISTS(SELECT 1 FROM series_replacements r WHERE r.original_booking_id=b.id AND r.replacement_id=NEW.series_id AND r.professional_id=NEW.professional_id))))
 THEN RAISE(ABORT,'SERVICE_CHANGED') END;
END;
