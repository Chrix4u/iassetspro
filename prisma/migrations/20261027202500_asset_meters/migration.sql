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

-- Backfill one stable AssetMeter per historical (asset, meter name, unit), using
-- the latest persisted reading as the authoritative current baseline.
WITH latest_meter_readings AS (
  SELECT DISTINCT ON ("assetId", "meterName", "unit")
    "assetId",
    "meterName",
    "unit",
    "value",
    "readingDate",
    "readById"
  FROM "meter_readings"
  WHERE "assetId" IS NOT NULL
  ORDER BY "assetId", "meterName", "unit", "readingDate" DESC, "createdAt" DESC
)
INSERT INTO "asset_meters" (
  "id", "assetId", "name", "unit", "meterType", "currentValue", "lastReadingAt",
  "isActive", "createdById", "createdAt", "updatedAt"
)
SELECT
  'am_' || substr(md5(lmr."assetId" || E'\x1f' || lmr."meterName" || E'\x1f' || lmr."unit"), 1, 24),
  lmr."assetId",
  lmr."meterName",
  lmr."unit",
  'general',
  lmr."value",
  lmr."readingDate",
  true,
  lmr."readById",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM latest_meter_readings lmr
ON CONFLICT ("assetId", "name", "unit") DO UPDATE
SET
  "currentValue" = EXCLUDED."currentValue",
  "lastReadingAt" = EXCLUDED."lastReadingAt",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "meter_readings" mr
SET "assetMeterId" = am."id"
FROM "asset_meters" am
WHERE mr."assetMeterId" IS NULL
  AND mr."assetId" = am."assetId"
  AND mr."meterName" = am."name"
  AND mr."unit" = am."unit";

UPDATE "pm_schedule_tasks" pst
SET "assetMeterId" = am."id"
FROM "asset_meters" am
WHERE pst."assetMeterId" IS NULL
  AND pst."maintenanceMode" = 'ubm'
  AND pst."assetId" = am."assetId"
  AND pst."meterName" = am."name"
  AND pst."frequencyUnit" = am."unit";

-- Canonical meeting vocabulary while retaining legacy schedule provenance.
UPDATE "pm_schedule_tasks"
SET "equipmentState" = 'standstill'
WHERE lower("equipmentState") = 'stopped';

UPDATE "pm_schedule_tasks"
SET
  "pmType" = CASE
    WHEN lower("maintenanceMode") IN ('tbm', 'ubm', 'cbm', 'fbm') THEN lower("maintenanceMode")
    ELSE 'tbm'
  END,
  "basis" = CASE
    WHEN lower("maintenanceMode") = 'tbm' THEN 'calendar'
    WHEN lower("maintenanceMode") = 'ubm' THEN 'meter'
    ELSE NULL
  END,
  "activityMode" = COALESCE(NULLIF("activityMode", ''), 'inspection');
