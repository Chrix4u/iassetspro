CREATE TABLE "asset_functional_location_assignments" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "hierarchySystemId" TEXT NOT NULL,
  "functionalLocationId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "reason" TEXT,
  "assignedById" TEXT,
  "endedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_functional_location_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "asset_functional_location_assignments_time_check" CHECK ("endedAt" IS NULL OR "endedAt" >= "assignedAt")
);

CREATE INDEX "asset_functional_location_assignments_assetId_hierarchySystemId_assignedAt_idx"
  ON "asset_functional_location_assignments"("assetId", "hierarchySystemId", "assignedAt");
CREATE INDEX "asset_functional_location_assignments_functionalLocationId_endedAt_idx"
  ON "asset_functional_location_assignments"("functionalLocationId", "endedAt");
CREATE INDEX "asset_functional_location_assignments_hierarchySystemId_endedAt_idx"
  ON "asset_functional_location_assignments"("hierarchySystemId", "endedAt");

CREATE UNIQUE INDEX "asset_functional_location_current_system_idx"
  ON "asset_functional_location_assignments"("assetId", "hierarchySystemId")
  WHERE "endedAt" IS NULL;

ALTER TABLE "asset_functional_location_assignments"
  ADD CONSTRAINT "asset_functional_location_assignments_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_functional_location_assignments"
  ADD CONSTRAINT "asset_functional_location_assignments_hierarchySystemId_fkey"
  FOREIGN KEY ("hierarchySystemId") REFERENCES "hierarchy_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_functional_location_assignments"
  ADD CONSTRAINT "asset_functional_location_assignments_functionalLocationId_fkey"
  FOREIGN KEY ("functionalLocationId") REFERENCES "functional_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "asset_functional_location_assignments"
  ADD CONSTRAINT "asset_functional_location_assignments_assignedById_fkey"
  FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_functional_location_assignments"
  ADD CONSTRAINT "asset_functional_location_assignments_endedById_fkey"
  FOREIGN KEY ("endedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
