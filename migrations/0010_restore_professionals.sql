DROP TRIGGER guard_professional_update;
CREATE TRIGGER guard_professional_update BEFORE UPDATE ON professionals
BEGIN
  SELECT CASE WHEN NEW.id!=OLD.id OR NEW.slug!=OLD.slug
    OR NEW.version!=OLD.version+1 OR NEW.created_at!=OLD.created_at
    OR (OLD.status='deleted' AND (
      NEW.status!='active'
      OR NEW.display_name IS NOT OLD.display_name
      OR NEW.header_title IS NOT OLD.header_title
      OR NEW.header_subtitle IS NOT OLD.header_subtitle
      OR NEW.theme IS NOT OLD.theme
      OR NEW.invited_email IS NOT OLD.invited_email
      OR NEW.google_subject IS NOT OLD.google_subject
      OR NEW.whatsapp_number IS NOT OLD.whatsapp_number
      OR NEW.whatsapp_enabled!=0
    ))
    THEN RAISE(ABORT,'INVALID_TRANSITION') END;
END;
DROP TRIGGER record_professional_update;
CREATE TRIGGER record_professional_update AFTER UPDATE ON professionals
BEGIN
  INSERT INTO professional_events(professional_id,action,actor_subject,version)
    VALUES(NEW.id,CASE
      WHEN OLD.status='deleted' AND NEW.status='active' THEN 'restored'
      WHEN NEW.status!=OLD.status THEN NEW.status
      ELSE 'updated' END,NEW.last_actor,NEW.version);
END;
