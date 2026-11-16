-- Planner-owned daily shift standards. Existing shift records are retained unchanged.
CREATE TABLE "production_shift_plans" (
  "id" TEXT NOT NULL,
  "plantId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "shiftTemplateId" TEXT NOT NULL,
  "productionDate" DATE NOT NULL,
  "plannedShiftsPerDay" INTEGER NOT NULL,
  "shiftHours" DOUBLE PRECISION NOT NULL,
  "availableMinutes" INTEGER NOT NULL,
  "targetQuantity" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "standardUtilizationPct" DOUBLE PRECISION,
  "standardSpeed" DOUBLE PRECISION,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_shift_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "production_shift_plans_valid_values" CHECK (
    "plannedShiftsPerDay" BETWEEN 1 AND 8
    AND "shiftHours" > 0 AND "shiftHours" <= 24
    AND "availableMinutes" BETWEEN 0 AND 1440
    AND "availableMinutes" <= "shiftHours" * 60
    AND "targetQuantity" >= 0 AND "targetQuantity" < 1000000000000
    AND ("standardUtilizationPct" IS NULL OR "standardUtilizationPct" BETWEEN 0 AND 100)
    AND ("standardSpeed" IS NULL OR "standardSpeed" >= 0)
  )
);
CREATE UNIQUE INDEX "production_shift_plans_assetId_productionDate_shiftTemplateId_key" ON "production_shift_plans"("assetId", "productionDate", "shiftTemplateId");
CREATE INDEX "production_shift_plans_plantId_productionDate_idx" ON "production_shift_plans"("plantId", "productionDate");
ALTER TABLE "production_shift_plans" ADD CONSTRAINT "production_shift_plans_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_shift_plans" ADD CONSTRAINT "production_shift_plans_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_shift_plans" ADD CONSTRAINT "production_shift_plans_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "production_shift_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Freeze the plan standards into each submitted record for historical reports.
ALTER TABLE "production_shift_records"
  ADD COLUMN "standardUtilizationPct" DOUBLE PRECISION,
  ADD COLUMN "standardSpeed" DOUBLE PRECISION,
  ADD COLUMN "plannedShiftsPerDay" INTEGER,
  ADD COLUMN "shiftHours" DOUBLE PRECISION;
