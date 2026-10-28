-- Engineer-meeting PM migration foundation.
-- Add direct target/planning identity while retaining legacy schedule provenance.
ALTER TABLE "pm_schedule_tasks"
  ADD COLUMN "assetId" TEXT,
  ADD COLUMN "componentId" TEXT,
  ADD COLUMN "assetMeterId" TEXT,
  ADD COLUMN "pmType" TEXT NOT NULL DEFAULT 'tbm',
  ADD COLUMN "activityMode" TEXT NOT NULL DEFAULT 'inspection',
  ADD COLUMN "basis" TEXT DEFAULT 'calendar';

UPDATE "pm_schedule_tasks" AS pst
SET
  "assetId" = ps."assetId",
  "componentId" = ps."componentId",
  "pmType" = CASE
    WHEN pst."maintenanceMode" IN ('tbm', 'ubm', 'cbm') THEN pst."maintenanceMode"
    ELSE 'tbm'
  END,
  "basis" = CASE
    WHEN pst."maintenanceMode" = 'ubm' THEN 'meter'
    WHEN pst."maintenanceMode" = 'tbm' THEN 'calendar'
    ELSE NULL
  END
FROM "pm_schedules" AS ps
WHERE pst."scheduleId" = ps."id";

ALTER TABLE "pm_schedule_tasks"
  ALTER COLUMN "assetId" SET NOT NULL,
  ALTER COLUMN "scheduleId" DROP NOT NULL;

ALTER TABLE "pm_schedule_tasks"
  DROP CONSTRAINT IF EXISTS "pm_schedule_tasks_scheduleId_fkey";
ALTER TABLE "pm_schedule_tasks"
  ADD CONSTRAINT "pm_schedule_tasks_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "pm_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pm_schedule_tasks"
  ADD CONSTRAINT "pm_schedule_tasks_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pm_schedule_tasks"
  ADD CONSTRAINT "pm_schedule_tasks_componentId_fkey"
  FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "pm_schedule_tasks_assetId_isActive_idx" ON "pm_schedule_tasks"("assetId", "isActive");
CREATE INDEX "pm_schedule_tasks_componentId_isActive_idx" ON "pm_schedule_tasks"("componentId", "isActive");
CREATE INDEX "pm_schedule_tasks_assetMeterId_isActive_idx" ON "pm_schedule_tasks"("assetMeterId", "isActive");
