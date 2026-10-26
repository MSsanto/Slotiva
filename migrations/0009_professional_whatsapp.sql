ALTER TABLE professionals ADD COLUMN whatsapp_number TEXT
  CHECK(whatsapp_number IS NULL OR (
    length(whatsapp_number) BETWEEN 8 AND 15
    AND whatsapp_number NOT GLOB '*[^0-9]*'
    AND substr(whatsapp_number,1,1) BETWEEN '1' AND '9'
  ));
ALTER TABLE professionals ADD COLUMN whatsapp_enabled INTEGER NOT NULL DEFAULT 0
  CHECK(whatsapp_enabled IN (0,1) AND (whatsapp_enabled=0 OR whatsapp_number IS NOT NULL));
