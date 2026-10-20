CREATE TABLE weekly_hours (
  weekday INTEGER PRIMARY KEY CHECK(weekday BETWEEN 0 AND 6),
  opens INTEGER NOT NULL CHECK(opens BETWEEN 0 AND 1410 AND opens % 30 = 0),
  closes INTEGER NOT NULL CHECK(closes BETWEEN 30 AND 1440 AND closes % 30 = 0),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  CHECK(opens < closes)
);
INSERT INTO weekly_hours VALUES (0,540,1020,1),(1,540,1020,1),(2,540,1020,1),(3,540,1020,1),(4,540,1020,1),(5,540,1020,0),(6,540,1020,0);
CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL CHECK(service_id IN ('discovery','consulting','review')),
  date TEXT NOT NULL,
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  starts_at INTEGER NOT NULL,
  start_min INTEGER NOT NULL CHECK(start_min BETWEEN 0 AND 1439 AND start_min % 30 = 0),
  end_min INTEGER NOT NULL,
  occupied_until INTEGER NOT NULL CHECK(occupied_until <= 1440),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
  email TEXT NOT NULL,
  cancel_hash TEXT NOT NULL,
  cancelled INTEGER NOT NULL DEFAULT 0 CHECK(cancelled IN (0,1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK(end_min = start_min + CASE service_id WHEN 'discovery' THEN 30 WHEN 'consulting' THEN 60 ELSE 45 END),
  CHECK(occupied_until = end_min + 15)
);
CREATE INDEX bookings_agenda ON bookings(cancelled,date,start_min);
CREATE TABLE occupied_slots (
  date TEXT NOT NULL,
  minute INTEGER NOT NULL,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  PRIMARY KEY(date,minute)
);
CREATE INDEX occupied_booking ON occupied_slots(booking_id);
CREATE TRIGGER validate_booking_insert BEFORE INSERT ON bookings WHEN NEW.cancelled=0
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM weekly_hours WHERE weekday=NEW.weekday AND enabled=1
    AND NEW.start_min >= opens AND NEW.occupied_until <= closes
  ) THEN RAISE(ABORT,'OUTSIDE_HOURS') END;
END;
CREATE TRIGGER validate_booking_update BEFORE UPDATE ON bookings WHEN NEW.cancelled=0
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM weekly_hours WHERE weekday=NEW.weekday AND enabled=1
    AND NEW.start_min >= opens AND NEW.occupied_until <= closes
  ) THEN RAISE(ABORT,'OUTSIDE_HOURS') END;
END;
-- Every occupied 15-minute interval is inserted by the database itself.
-- UNIQUE conflicts abort the entire INSERT/UPDATE, including these triggers.
CREATE TRIGGER occupy_insert AFTER INSERT ON bookings WHEN NEW.cancelled=0
BEGIN
  INSERT INTO occupied_slots(date,minute,booking_id)
  SELECT NEW.date,NEW.start_min + value*15,NEW.id
  FROM json_each('[0,1,2,3,4]') WHERE NEW.start_min+value*15 < NEW.occupied_until;
END;
CREATE TRIGGER occupy_update AFTER UPDATE ON bookings
BEGIN
  DELETE FROM occupied_slots WHERE booking_id=OLD.id;
  INSERT INTO occupied_slots(date,minute,booking_id)
  SELECT NEW.date,NEW.start_min + value*15,NEW.id
  FROM json_each('[0,1,2,3,4]') WHERE NEW.cancelled=0 AND NEW.start_min+value*15 < NEW.occupied_until;
END;
CREATE TRIGGER protect_existing_bookings AFTER UPDATE ON weekly_hours
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM bookings WHERE cancelled=0 AND weekday=NEW.weekday AND starts_at >= unixepoch()
    AND (NEW.enabled=0 OR start_min<NEW.opens OR occupied_until>NEW.closes)
  ) THEN RAISE(ABORT,'EXISTING_BOOKINGS') END;
END;
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
CREATE TABLE login_attempts (client_key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,started_at INTEGER NOT NULL);
