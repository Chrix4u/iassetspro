-- Additive paper-to-digital provenance. No backfill of older records or dates.
ALTER TABLE "component_inspection_records"
  ADD COLUMN IF NOT EXISTS "capture_source" TEXT, -- NULL for historical unknown origin
  ADD COLUMN IF NOT EXISTS "field_inspected_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "field_inspector_name" TEXT,
  ADD COLUMN IF NOT EXISTS "paper_reference" TEXT;
