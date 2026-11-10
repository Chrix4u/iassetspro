-- A planned field visit is not a PM due-date reset. Preserve what the planner issued.
ALTER TABLE "pm_paper_worksheet_issues"
  ADD COLUMN "planned_for_date" TEXT,
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'routine';

-- Preserve the inspection intent for each paper or electronic reading.
ALTER TABLE "component_inspection_records"
  ADD COLUMN "inspection_purpose" TEXT;
