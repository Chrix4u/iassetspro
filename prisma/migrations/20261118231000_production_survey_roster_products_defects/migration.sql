-- Product design codes and approved shift assignment rosters; preserves all existing production data.
ALTER TABLE "production_shift_plans"
  ADD COLUMN "plannedBreakMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "productCode" VARCHAR(80),
  ADD COLUMN "startsAt" TEXT,
  ADD COLUMN "endsAt" TEXT;
ALTER TABLE "production_shift_plans"
  ADD CONSTRAINT "production_shift_plans_break_allowance" CHECK ("plannedBreakMinutes" BETWEEN 0 AND "availableMinutes");

ALTER TABLE "production_shift_records"
  ADD COLUMN "planId" TEXT,
  ADD COLUMN "productCode" VARCHAR(80),
  ADD COLUMN "defectiveQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "startDelayMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "production_shift_records"
  ADD CONSTRAINT "production_shift_records_valid_defects" CHECK (
    "defectiveQuantity" >= 0 AND "defectiveQuantity" <= "outputQuantity"
    AND "startDelayMinutes" BETWEEN 0 AND 1440
  );
UPDATE "production_shift_records" AS r SET "planId" = p.id, "productCode" = p."productCode"
FROM "production_shift_plans" AS p
WHERE r."assetId" = p."assetId"
  AND r."productionDate" = p."productionDate"
  AND r."shiftTemplateId" = p."shiftTemplateId";
CREATE INDEX "production_shift_records_planId_status_idx" ON "production_shift_records"("planId","status");
ALTER TABLE "production_shift_records" ADD CONSTRAINT "production_shift_records_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "production_shift_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "production_shift_assignments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "isLeader" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "production_shift_assignments_planId_userId_key"
  ON "production_shift_assignments"("planId","userId");
CREATE UNIQUE INDEX "production_shift_assignments_one_leader"
  ON "production_shift_assignments"("planId") WHERE "isLeader" = true;
CREATE INDEX "production_shift_assignments_userId_planId_idx"
  ON "production_shift_assignments"("userId","planId");
ALTER TABLE "production_shift_assignments" ADD CONSTRAINT "production_shift_assignments_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "production_shift_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_shift_assignments" ADD CONSTRAINT "production_shift_assignments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "production_machine_products" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "plantId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "unit" VARCHAR(32) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "production_machine_products_assetId_code_key"
  ON "production_machine_products"("assetId","code");
CREATE INDEX "production_machine_products_plantId_assetId_isActive_idx"
  ON "production_machine_products"("plantId","assetId","isActive");
ALTER TABLE "production_machine_products" ADD CONSTRAINT "production_machine_products_plantId_fkey"
  FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_machine_products" ADD CONSTRAINT "production_machine_products_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
