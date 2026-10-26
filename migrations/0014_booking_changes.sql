CREATE TABLE booking_changes (
 id TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 professional_id TEXT NOT NULL REFERENCES professionals(id),
 booking_version INTEGER NOT NULL,
 replacement_id TEXT NOT NULL UNIQUE,
 date TEXT NOT NULL,
 weekday INTEGER NOT NULL,
 starts_at INTEGER NOT NULL,
 start_min INTEGER NOT NULL,
 end_min INTEGER NOT NULL,
 occupied_until INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected','expired','cancelled')),
 expires_at INTEGER NOT NULL DEFAULT (unixepoch()+86400),
 version INTEGER NOT NULL DEFAULT 1,
 actor TEXT,
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX one_pending_booking_change ON booking_changes(booking_id) WHERE state='pending';
CREATE TRIGGER validate_change_insert BEFORE INSERT ON booking_changes BEGIN
 SELECT CASE WHEN NEW.state!='pending' OR NEW.version!=1 OR NEW.created_at!=unixepoch() OR NEW.expires_at!=unixepoch()+86400 OR NEW.starts_at<unixepoch()+172800 OR NOT EXISTS(SELECT 1 FROM bookings b JOIN professionals p ON p.id=b.professional_id AND p.status='active' WHERE b.id=NEW.booking_id AND b.professional_id=NEW.professional_id AND b.version=NEW.booking_version AND b.status='confirmed' AND b.starts_at>unixepoch() AND NEW.end_min-NEW.start_min=b.service_duration)
 THEN RAISE(ABORT,'INVALID_TRANSITION') END;
END;
CREATE TRIGGER validate_change_update BEFORE UPDATE ON booking_changes BEGIN
 SELECT CASE WHEN OLD.state!='pending' OR NEW.version!=OLD.version+1 OR NEW.state='pending' OR NEW.id!=OLD.id OR NEW.booking_id!=OLD.booking_id OR NEW.professional_id!=OLD.professional_id OR NEW.booking_version!=OLD.booking_version OR NEW.replacement_id!=OLD.replacement_id OR NEW.date!=OLD.date OR NEW.starts_at!=OLD.starts_at OR NEW.start_min!=OLD.start_min OR NEW.end_min!=OLD.end_min OR NEW.occupied_until!=OLD.occupied_until OR NEW.weekday!=OLD.weekday OR NEW.expires_at!=OLD.expires_at OR NEW.created_at!=OLD.created_at
 THEN RAISE(ABORT,'INVALID_TRANSITION') END;
 SELECT CASE WHEN NEW.state IN ('approved','rejected') AND (OLD.expires_at<=unixepoch() OR NEW.actor IS NULL) THEN RAISE(ABORT,'INVALID_TRANSITION') END;
 SELECT CASE WHEN NEW.state='approved' AND (NEW.starts_at<=unixepoch() OR NOT EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking_id AND status='confirmed' AND version=NEW.booking_version AND starts_at>unixepoch())) THEN RAISE(ABORT,'INVALID_TRANSITION') END;
END;
CREATE TRIGGER apply_booking_change AFTER UPDATE ON booking_changes WHEN NEW.state='approved' BEGIN
 INSERT INTO booking_series(id,professional_id,request_id,request_hash,frequency,occurrence_count,actor_subject) VALUES(NEW.id,NEW.professional_id,NEW.id,NEW.id,'once',1,NEW.actor);
 UPDATE bookings SET status='cancelled',cancelled=1,version=version+1,decided_at=unixepoch() WHERE id=NEW.booking_id;
 INSERT INTO bookings(id,professional_id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash,status,decided_at,source,series_id,service_name,service_description,service_duration,service_price_mode,service_price_cents,service_version)
 SELECT NEW.replacement_id,b.professional_id,b.service_id,NEW.date,NEW.weekday,NEW.starts_at,NEW.start_min,NEW.end_min,NEW.occupied_until,b.name,b.email,b.cancel_hash,'confirmed',unixepoch(),'professional',NEW.id,b.service_name,b.service_description,b.service_duration,b.service_price_mode,b.service_price_cents,b.service_version FROM bookings b WHERE b.id=NEW.booking_id;
 INSERT INTO customer_grants(session_hash,booking_id,expires_at) SELECT session_hash,NEW.replacement_id,expires_at FROM customer_grants WHERE booking_id=NEW.booking_id AND expires_at>unixepoch();
END;
CREATE TRIGGER cancel_obsolete_booking_changes AFTER UPDATE OF status ON bookings WHEN NEW.status!='confirmed' BEGIN
 UPDATE booking_changes SET state='cancelled',version=version+1 WHERE booking_id=NEW.id AND state='pending';
END;
