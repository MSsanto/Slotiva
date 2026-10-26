CREATE TABLE clients (
 id TEXT PRIMARY KEY,
 professional_id TEXT NOT NULL REFERENCES professionals(id),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 email TEXT NOT NULL DEFAULT '' CHECK(length(email)<=200),
 phone TEXT NOT NULL DEFAULT '' CHECK(length(phone)<=16),
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE booking_clients (
 booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
 client_id TEXT NOT NULL REFERENCES clients(id),
 version INTEGER NOT NULL DEFAULT 1
);
INSERT INTO clients(id,professional_id,name,email) SELECT coalesce(series_id,id),professional_id,name,email FROM bookings GROUP BY professional_id,coalesce(series_id,id);
INSERT INTO booking_clients(booking_id,client_id) SELECT id,coalesce(series_id,id) FROM bookings;
CREATE TRIGGER seed_booking_client AFTER INSERT ON bookings BEGIN
 INSERT OR IGNORE INTO clients(id,professional_id,name,email)
 SELECT coalesce((SELECT bc.client_id FROM booking_clients bc JOIN booking_changes c ON c.booking_id=bc.booking_id WHERE c.replacement_id=NEW.id),NEW.series_id,NEW.id),NEW.professional_id,NEW.name,NEW.email;
 INSERT INTO booking_clients(booking_id,client_id)
 SELECT NEW.id,coalesce((SELECT bc.client_id FROM booking_clients bc JOIN booking_changes c ON c.booking_id=bc.booking_id WHERE c.replacement_id=NEW.id),NEW.series_id,NEW.id);
END;
CREATE TRIGGER validate_client_update BEFORE UPDATE ON clients BEGIN
 SELECT CASE WHEN NEW.id!=OLD.id OR NEW.professional_id!=OLD.professional_id OR NEW.version!=OLD.version+1 OR NEW.created_at!=OLD.created_at THEN RAISE(ABORT,'INVALID_TRANSITION') END;
END;
CREATE TRIGGER validate_client_assignment_insert BEFORE INSERT ON booking_clients BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bookings b JOIN clients c ON c.professional_id=b.professional_id WHERE b.id=NEW.booking_id AND c.id=NEW.client_id) THEN RAISE(ABORT,'INVALID_TRANSITION') END;
END;
CREATE TRIGGER validate_client_assignment_update BEFORE UPDATE ON booking_clients BEGIN
 SELECT CASE WHEN NEW.booking_id!=OLD.booking_id OR NEW.version!=OLD.version+1 OR NOT EXISTS(SELECT 1 FROM bookings b JOIN clients c ON c.professional_id=b.professional_id WHERE b.id=NEW.booking_id AND c.id=NEW.client_id) THEN RAISE(ABORT,'INVALID_TRANSITION') END;
END;
CREATE TABLE privacy_requests (
 id TEXT PRIMARY KEY,
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 professional_id TEXT NOT NULL REFERENCES professionals(id),
 kind TEXT NOT NULL CHECK(kind IN ('export','delete')),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','reviewing','closed')),
 version INTEGER NOT NULL DEFAULT 1,
 requested_at INTEGER NOT NULL DEFAULT (unixepoch()),
 reviewed_by TEXT
);
CREATE UNIQUE INDEX one_open_privacy_request ON privacy_requests(booking_id,kind) WHERE state!='closed';
