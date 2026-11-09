-- Record the operating state at the exact time of an inspection.
-- Existing/legacy inspections retain NULL; do not backfill from current asset state.
-- Values are validated by the POST inspection route (running / standstill).
ALTER TABLE "component_inspection_records"
  ADD COLUMN IF NOT EXISTS "equipment_state" TEXT;

-- No blocking default/rewrite and no new frequency/schedule types.
