-- Rebuild fixed-duration bookings while preserving every dependent row.
-- D1 defers checks, but CASCADE still runs: explicitly preserve occupied slots.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE professional_services (
 professional_id TEXT NOT NULL REFERENCES professionals(id),
 id TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 description TEXT NOT NULL DEFAULT '' CHECK(length(description)<=500),
 duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 15 AND 240 AND duration_minutes%5=0),
 price_mode TEXT NOT NULL CHECK(price_mode IN ('free','paid','hidden')),
 price_cents INTEGER,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 position INTEGER NOT NULL DEFAULT 0,
 last_actor TEXT NOT NULL DEFAULT 'system',
 PRIMARY KEY(professional_id,id),
 CHECK((price_mode='free' AND price_cents IS NOT NULL AND price_cents=0) OR
       (price_mode='paid' AND price_cents IS NOT NULL AND price_cents BETWEEN 1 AND 99999999) OR
       (price_mode='hidden' AND price_cents IS NULL))
);
INSERT INTO professional_services(professional_id,id,name,description,duration_minutes,price_mode,price_cents,position)
 SELECT p.id,s.id,s.name,s.description,s.duration,s.mode,s.cents,s.position FROM professionals p CROSS JOIN (
 SELECT 'discovery' id,'Conversa inicial' name,'Um primeiro encontro para entender seus objetivos.' description,30 duration,'free' mode,0 cents,0 position
 UNION ALL SELECT 'consulting','Consultoria individual','Tempo dedicado para transformar ideias em próximos passos.',60,'paid',15000,1
 UNION ALL SELECT 'review','Sessão de acompanhamento','Revise o progresso e ajuste a direção.',45,'paid',10000,2
 ) s;
CREATE TRIGGER seed_professional_services AFTER INSERT ON professionals BEGIN
INSERT INTO professional_services(professional_id,id,name,description,duration_minutes,price_mode,price_cents,position) SELECT NEW.id,'discovery','Conversa inicial','Um primeiro encontro para entender seus objetivos.',30,'free',0,0;
 INSERT INTO professional_services(professional_id,id,name,description,duration_minutes,price_mode,price_cents,position) SELECT NEW.id,'consulting','Consultoria individual','Tempo dedicado para transformar ideias em próximos passos.',60,'paid',15000,1;
 INSERT INTO professional_services(professional_id,id,name,description,duration_minutes,price_mode,price_cents,position) SELECT NEW.id,'review','Sessão de acompanhamento','Revise o progresso e ajuste a direção.',45,'paid',10000,2;
END;
CREATE TRIGGER guard_service_update BEFORE UPDATE ON professional_services BEGIN
 SELECT CASE WHEN NEW.professional_id!=OLD.professional_id OR NEW.id!=OLD.id OR NEW.version!=OLD.version+1
 THEN RAISE(ABORT,'SERVICE_CHANGED') END;
END;
CREATE TABLE migration_0006_occupied AS SELECT * FROM occupied_slots;
DROP TRIGGER approval_update;
DROP TRIGGER record_booking_transition;
DROP TRIGGER validate_booking_insert;
DROP TRIGGER validate_booking_update;
DROP TRIGGER occupy_insert;
DROP TRIGGER occupy_update;
DROP TRIGGER protect_existing_bookings;
DROP TRIGGER delete_professional_bookings;
DROP TRIGGER approval_insert;
DROP TRIGGER guard_booking_source;
DROP TRIGGER record_manual_booking;
CREATE TABLE bookings_next (
 id TEXT PRIMARY KEY,
 service_id TEXT NOT NULL,
 date TEXT NOT NULL,
 weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
 starts_at INTEGER NOT NULL,
 start_min INTEGER NOT NULL CHECK(start_min BETWEEN 0 AND 1439 AND start_min%30=0),
 end_min INTEGER NOT NULL,
 occupied_until INTEGER NOT NULL CHECK(occupied_until<=1440),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 email TEXT NOT NULL,
 cancel_hash TEXT NOT NULL,
 cancelled INTEGER NOT NULL DEFAULT 0 CHECK(cancelled IN (0,1)),
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 status TEXT NOT NULL DEFAULT 'pending_approval' CHECK(status IN ('pending_approval','confirmed','rejected','expired','cancelled')),
 approval_expires_at INTEGER,
 decided_at INTEGER,
 version INTEGER NOT NULL DEFAULT 1,
 professional_id TEXT NOT NULL DEFAULT 'demo' REFERENCES professionals(id),
 source TEXT NOT NULL DEFAULT 'public' CHECK(source IN ('public','professional')),
 series_id TEXT REFERENCES booking_series(id),
 service_name TEXT NOT NULL,
 service_description TEXT NOT NULL,
 service_duration INTEGER NOT NULL CHECK(service_duration BETWEEN 15 AND 240 AND service_duration%5=0),
 service_price_mode TEXT NOT NULL CHECK(service_price_mode IN ('free','paid','hidden')),
 service_price_cents INTEGER,
 service_version INTEGER NOT NULL CHECK(service_version>=1),
 FOREIGN KEY(professional_id,service_id) REFERENCES professional_services(professional_id,id),
 CHECK(end_min=start_min+service_duration),
 CHECK(occupied_until=end_min+15),
 CHECK((service_price_mode='free' AND service_price_cents IS NOT NULL AND service_price_cents=0) OR
       (service_price_mode='paid' AND service_price_cents IS NOT NULL AND service_price_cents BETWEEN 1 AND 99999999) OR
       (service_price_mode='hidden' AND service_price_cents IS NULL))
);
INSERT INTO bookings_next(id,service_id,date,weekday,starts_at,start_min,end_min,occupied_until,name,email,cancel_hash,cancelled,created_at,status,approval_expires_at,decided_at,version,professional_id,source,series_id,service_name,service_description,service_duration,service_price_mode,service_price_cents,service_version) SELECT b.id,b.service_id,b.date,b.weekday,b.starts_at,b.start_min,b.end_min,b.occupied_until,b.name,b.email,b.cancel_hash,b.cancelled,b.created_at,b.status,b.approval_expires_at,b.decided_at,b.version,b.professional_id,b.source,b.series_id,s.name,s.description,s.duration_minutes,s.price_mode,s.price_cents,s.version FROM bookings b JOIN professional_services s ON s.professional_id=b.professional_id AND s.id=b.service_id;
DROP TABLE bookings;
ALTER TABLE bookings_next RENAME TO bookings;
INSERT INTO occupied_slots SELECT * FROM migration_0006_occupied;
DROP TABLE migration_0006_occupied;
CREATE INDEX bookings_agenda ON bookings(cancelled,date,start_min);
CREATE INDEX bookings_pending_expiry ON bookings(status,approval_expires_at);
CREATE INDEX bookings_professional_agenda ON bookings(professional_id,status,date,start_min);
CREATE INDEX bookings_series ON bookings(series_id,starts_at);
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
    FROM json_each('[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]') WHERE NEW.start_min+value*15<NEW.occupied_until;
END;
CREATE TRIGGER occupy_update AFTER UPDATE ON bookings
BEGIN
  DELETE FROM occupied_slots WHERE booking_id=OLD.id;
  INSERT INTO occupied_slots(professional_id,date,minute,booking_id)
    SELECT NEW.professional_id,NEW.date,NEW.start_min+value*15,NEW.id
    FROM json_each('[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]') WHERE NEW.cancelled=0 AND NEW.start_min+value*15<NEW.occupied_until;
END;
CREATE TRIGGER protect_existing_bookings AFTER UPDATE ON weekly_hours
BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE professional_id=NEW.professional_id
    AND cancelled=0 AND weekday=NEW.weekday AND starts_at>=unixepoch()
    AND (NEW.enabled=0 OR start_min<NEW.opens OR occupied_until>NEW.closes))
    THEN RAISE(ABORT,'EXISTING_BOOKINGS') END;
END;
CREATE TRIGGER delete_professional_bookings AFTER UPDATE OF status ON professionals WHEN NEW.status='deleted'
BEGIN
  UPDATE bookings SET status='expired',cancelled=1,version=version+1,decided_at=unixepoch()
    WHERE professional_id=NEW.id AND status='pending_approval' AND approval_expires_at<=unixepoch();
  UPDATE bookings SET status='cancelled',cancelled=1,version=version+1,decided_at=unixepoch()
    WHERE professional_id=NEW.id AND status IN ('pending_approval','confirmed');
END;
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
CREATE TRIGGER validate_booking_service BEFORE INSERT ON bookings BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM professional_services s WHERE s.professional_id=NEW.professional_id AND s.id=NEW.service_id AND s.active=1
 AND s.version=NEW.service_version AND s.name=NEW.service_name AND s.description=NEW.service_description
 AND s.duration_minutes=NEW.service_duration AND s.price_mode=NEW.service_price_mode AND s.price_cents IS NEW.service_price_cents)
 THEN RAISE(ABORT,'SERVICE_CHANGED') END;
END;
CREATE TRIGGER preserve_booking_service BEFORE UPDATE ON bookings BEGIN
 SELECT CASE WHEN NEW.service_id!=OLD.service_id OR NEW.service_name!=OLD.service_name OR NEW.service_description!=OLD.service_description
 OR NEW.service_duration!=OLD.service_duration OR NEW.service_price_mode!=OLD.service_price_mode OR NEW.service_price_cents IS NOT OLD.service_price_cents
 OR NEW.service_version!=OLD.service_version THEN RAISE(ABORT,'SERVICE_SNAPSHOT_IMMUTABLE') END;
END;
PRAGMA defer_foreign_keys=OFF;
