-- Phase 3C: immutable maintenance Functional Location snapshots.
-- These are denormalized historical fields, intentionally not foreign keys.
ALTER TABLE "maintenance_requests"
  ADD COLUMN "functionalLocationIdSnapshot" TEXT,
  ADD COLUMN "functionalLocationNameSnapshot" TEXT,
  ADD COLUMN "functionalLocationCodeSnapshot" TEXT,
  ADD COLUMN "functionalLocationPathSnapshot" TEXT,
  ADD COLUMN "functionalLocationPathCodeSnapshot" TEXT,
  ADD COLUMN "functionalLocationSourceSnapshot" TEXT;

ALTER TABLE "work_orders"
  ADD COLUMN "functionalLocationIdSnapshot" TEXT,
  ADD COLUMN "functionalLocationNameSnapshot" TEXT,
  ADD COLUMN "functionalLocationCodeSnapshot" TEXT,
  ADD COLUMN "functionalLocationPathSnapshot" TEXT,
  ADD COLUMN "functionalLocationPathCodeSnapshot" TEXT,
  ADD COLUMN "functionalLocationSourceSnapshot" TEXT;

CREATE INDEX "maintenance_requests_functionalLocationIdSnapshot_idx"
  ON "maintenance_requests"("functionalLocationIdSnapshot");
CREATE INDEX "work_orders_functionalLocationIdSnapshot_idx"
  ON "work_orders"("functionalLocationIdSnapshot");
