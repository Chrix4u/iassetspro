-- Component-targeted preventive maintenance schedules.
ALTER TABLE "pm_schedules" ADD COLUMN "componentId" TEXT;

CREATE INDEX "pm_schedules_componentId_idx" ON "pm_schedules"("componentId");

ALTER TABLE "pm_schedules"
ADD CONSTRAINT "pm_schedules_componentId_fkey"
FOREIGN KEY ("componentId") REFERENCES "component_registry"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
