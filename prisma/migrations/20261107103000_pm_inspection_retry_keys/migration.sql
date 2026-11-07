-- Existing inspection records retain a NULL retry key.
-- New mobile/desktop submissions can be safely replayed without duplication.
ALTER TABLE "component_inspection_records"
  ADD COLUMN IF NOT EXISTS "request_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "component_inspection_records_request_key_key"
  ON "component_inspection_records"("request_key");
