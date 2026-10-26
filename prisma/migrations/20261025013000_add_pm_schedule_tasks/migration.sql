-- Add task-level PM planning without rewriting existing schedule cadence.
CREATE TABLE "pm_schedule_tasks" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "pmTaskId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "maintenanceMode" TEXT NOT NULL,
    "equipmentState" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "leadDays" INTEGER NOT NULL DEFAULT 0,
    "frequencyInterval" DOUBLE PRECISION,
    "frequencyUnit" TEXT,
    "meterName" TEXT,
    "nextDueReading" DOUBLE PRECISION,
    "conditionSourceType" TEXT,
    "conditionSourceId" TEXT,
    "conditionMetric" TEXT,
    "conditionOperator" TEXT,
    "conditionThreshold" DOUBLE PRECISION,
    "conditionThresholdMax" DOUBLE PRECISION,
    "conditionUnit" TEXT,
    "evaluationCadenceMinutes" INTEGER,
    "lastCompletedAt" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pm_schedule_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pm_schedule_tasks_scheduleId_pmTaskId_key" ON "pm_schedule_tasks"("scheduleId", "pmTaskId");
CREATE INDEX "pm_schedule_tasks_scheduleId_isActive_sortOrder_idx" ON "pm_schedule_tasks"("scheduleId", "isActive", "sortOrder");
CREATE INDEX "pm_schedule_tasks_maintenanceMode_isActive_nextDueDate_idx" ON "pm_schedule_tasks"("maintenanceMode", "isActive", "nextDueDate");
CREATE INDEX "pm_schedule_tasks_meterName_isActive_idx" ON "pm_schedule_tasks"("meterName", "isActive");
CREATE INDEX "pm_schedule_tasks_conditionSourceType_conditionSourceId_isActive_idx" ON "pm_schedule_tasks"("conditionSourceType", "conditionSourceId", "isActive");

ALTER TABLE "pm_schedule_tasks"
ADD CONSTRAINT "pm_schedule_tasks_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "pm_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pm_schedule_tasks"
ADD CONSTRAINT "pm_schedule_tasks_pmTaskId_fkey"
FOREIGN KEY ("pmTaskId") REFERENCES "pm_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
