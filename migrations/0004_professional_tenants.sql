CREATE TABLE professionals (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK(length(slug) BETWEEN 3 AND 48),
  display_name TEXT NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 100),
  header_title TEXT NOT NULL CHECK(length(header_title) BETWEEN 1 AND 120),
  header_subtitle TEXT NOT NULL DEFAULT '' CHECK(length(header_subtitle)<=240),
  theme TEXT NOT NULL DEFAULT 'forest' CHECK(theme IN ('forest','navy','plum')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','deleted')),
  invited_email TEXT UNIQUE,
  google_subject TEXT UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  last_actor TEXT NOT NULL DEFAULT 'system',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO professionals(id,slug,display_name,header_title,header_subtitle)
 VALUES('demo','demo','Ana Costa','Reserve seu momento','Conversas com propósito para construir o seu próximo capítulo.');
ALTER TABLE bookings ADD COLUMN professional_id TEXT NOT NULL DEFAULT 'demo';
CREATE INDEX bookings_professional_agenda ON bookings(professional_id,status,date,start_min);
ALTER TABLE sessions ADD COLUMN role TEXT NOT NULL DEFAULT 'professional' CHECK(role IN ('master','professional'));
ALTER TABLE sessions ADD COLUMN professional_id TEXT REFERENCES professionals(id);
UPDATE sessions SET professional_id='demo';

DROP TRIGGER validate_booking_insert;
DROP TRIGGER validate_booking_update;
DROP TRIGGER protect_existing_bookings;
DROP TRIGGER occupy_insert;
DROP TRIGGER occupy_update;
ALTER TABLE weekly_hours RENAME TO legacy_weekly_hours;
CREATE TABLE weekly_hours (
  professional_id TEXT NOT NULL REFERENCES professionals(id),
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  opens INTEGER NOT NULL CHECK(opens BETWEEN 0 AND 1410 AND opens % 30=0),
  closes INTEGER NOT NULL CHECK(closes BETWEEN 30 AND 1440 AND closes % 30=0),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  PRIMARY KEY(professional_id,weekday), CHECK(opens<closes)
);
INSERT INTO weekly_hours SELECT 'demo',weekday,opens,closes,enabled FROM legacy_weekly_hours;
DROP TABLE legacy_weekly_hours;
ALTER TABLE occupied_slots RENAME TO legacy_occupied_slots;
CREATE TABLE occupied_slots (
  professional_id TEXT NOT NULL REFERENCES professionals(id),
  date TEXT NOT NULL,
  minute INTEGER NOT NULL,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  PRIMARY KEY(professional_id,date,minute)
);
INSERT INTO occupied_slots SELECT 'demo',date,minute,booking_id FROM legacy_occupied_slots;
DROP TABLE legacy_occupied_slots;
CREATE INDEX occupied_booking ON occupied_slots(booking_id);

CREATE TRIGGER validate_booking_insert BEFORE INSERT ON bookings WHEN NEW.cancelled=0
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM professionals WHERE id=NEW.professional_id AND status='active')
    THEN RAISE(ABORT,'PROFESSIONAL_UNAVAILABLE') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM weekly_hours WHERE professional_id=NEW.professional_id
    AND weekday=NEW.weekday AND enabled=1 AND NEW.start_min>=opens AND NEW.occupied_until<=closes)
    THEN RAISE(ABORT,'OUTSIDE_HOURS') END;
END;
CREATE TRIGGER validate_booking_update BEFORE UPDATE ON bookings
BEGIN
  SELECT CASE WHEN NEW.professional_id!=OLD.professional_id THEN RAISE(ABORT,'INVALID_TRANSITION') END;
  SELECT CASE WHEN NEW.cancelled=0 AND NOT EXISTS(SELECT 1 FROM professionals WHERE id=NEW.professional_id AND status='active')
    THEN RAISE(ABORT,'PROFESSIONAL_UNAVAILABLE') END;
  SELECT CASE WHEN NEW.cancelled=0 AND NOT EXISTS(SELECT 1 FROM weekly_hours WHERE professional_id=NEW.professional_id
    AND weekday=NEW.weekday AND enabled=1 AND NEW.start_min>=opens AND NEW.occupied_until<=closes)
    THEN RAISE(ABORT,'OUTSIDE_HOURS') END;
END;
CREATE TRIGGER occupy_insert AFTER INSERT ON bookings WHEN NEW.cancelled=0
BEGIN
  INSERT INTO occupied_slots(professional_id,date,minute,booking_id)
    SELECT NEW.professional_id,NEW.date,NEW.start_min+value*15,NEW.id
    FROM json_each('[0,1,2,3,4]') WHERE NEW.start_min+value*15<NEW.occupied_until;
END;
CREATE TRIGGER occupy_update AFTER UPDATE ON bookings
BEGIN
  DELETE FROM occupied_slots WHERE booking_id=OLD.id;
  INSERT INTO occupied_slots(professional_id,date,minute,booking_id)
    SELECT NEW.professional_id,NEW.date,NEW.start_min+value*15,NEW.id
    FROM json_each('[0,1,2,3,4]') WHERE NEW.cancelled=0 AND NEW.start_min+value*15<NEW.occupied_until;
END;
CREATE TRIGGER protect_existing_bookings AFTER UPDATE ON weekly_hours
BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE professional_id=NEW.professional_id
    AND cancelled=0 AND weekday=NEW.weekday AND starts_at>=unixepoch()
    AND (NEW.enabled=0 OR start_min<NEW.opens OR occupied_until>NEW.closes))
    THEN RAISE(ABORT,'EXISTING_BOOKINGS') END;
END;
CREATE TABLE professional_events (
  id INTEGER PRIMARY KEY,
  professional_id TEXT NOT NULL REFERENCES professionals(id),
  action TEXT NOT NULL,
  actor_subject TEXT NOT NULL,
  version INTEGER NOT NULL,
  occurred_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TRIGGER seed_professional AFTER INSERT ON professionals
BEGIN
  INSERT INTO weekly_hours(professional_id,weekday,opens,closes,enabled)
    SELECT NEW.id,CAST(value AS INTEGER),540,1020,CASE WHEN value<5 THEN 1 ELSE 0 END
    FROM json_each('[0,1,2,3,4,5,6]');
  INSERT INTO professional_events(professional_id,action,actor_subject,version)
    VALUES(NEW.id,'created',NEW.last_actor,NEW.version);
END;
CREATE TRIGGER guard_professional_update BEFORE UPDATE ON professionals
BEGIN
  SELECT CASE WHEN OLD.status='deleted' OR NEW.id!=OLD.id OR NEW.slug!=OLD.slug
    OR NEW.version!=OLD.version+1 OR NEW.created_at!=OLD.created_at
    THEN RAISE(ABORT,'INVALID_TRANSITION') END;
END;
CREATE TRIGGER record_professional_update AFTER UPDATE ON professionals
BEGIN
  INSERT INTO professional_events(professional_id,action,actor_subject,version)
    VALUES(NEW.id,CASE WHEN NEW.status!=OLD.status THEN NEW.status ELSE 'updated' END,NEW.last_actor,NEW.version);
END;
CREATE TRIGGER revoke_professional AFTER UPDATE OF status ON professionals WHEN NEW.status!='active'
BEGIN
  DELETE FROM sessions WHERE professional_id=NEW.id;
END;
CREATE TRIGGER delete_professional_bookings AFTER UPDATE OF status ON professionals WHEN NEW.status='deleted'
BEGIN
  UPDATE bookings SET status='expired',cancelled=1,version=version+1,decided_at=unixepoch()
    WHERE professional_id=NEW.id AND status='pending_approval' AND approval_expires_at<=unixepoch();
  UPDATE bookings SET status='cancelled',cancelled=1,version=version+1,decided_at=unixepoch()
    WHERE professional_id=NEW.id AND status IN ('pending_approval','confirmed');
END;
CREATE TRIGGER preserve_professional_history BEFORE DELETE ON professionals
BEGIN
  SELECT RAISE(ABORT,'PROFESSIONAL_HISTORY_REQUIRED');
END;
