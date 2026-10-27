CREATE TABLE "asset_meters" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "meterType" TEXT NOT NULL DEFAULT 'general',
  "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lastReadingAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_meters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_meters_assetId_name_unit_key" ON "asset_meters"("assetId", "name", "unit");
CREATE INDEX "asset_meters_assetId_isActive_idx" ON "asset_meters"("assetId", "isActive");

ALTER TABLE "asset_meters"
  ADD CONSTRAINT "asset_meters_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meter_readings" ADD COLUMN "assetMeterId" TEXT;
CREATE INDEX "meter_readings_assetMeterId_readingDate_idx" ON "meter_readings"("assetMeterId", "readingDate");
ALTER TABLE "meter_readings"
  ADD CONSTRAINT "meter_readings_assetMeterId_fkey"
  FOREIGN KEY ("assetMeterId") REFERENCES "asset_meters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pm_schedule_tasks"
  ADD CONSTRAINT "pm_schedule_tasks_assetMeterId_fkey"
  FOREIGN KEY ("assetMeterId") REFERENCES "asset_meters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
