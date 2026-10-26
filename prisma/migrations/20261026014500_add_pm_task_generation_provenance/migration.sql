-- Add task-level PM generation provenance without rewriting existing schedule or WO history.
ALTER TABLE "pm_schedule_tasks"
ADD COLUMN "lastEvaluatedAt" TIMESTAMP(3),
ADD COLUMN "lastGeneratedAt" TIMESTAMP(3),
ADD COLUMN "lastGeneratedCycleKey" TEXT;

ALTER TABLE "wo_task_executions"
ADD COLUMN "pmScheduleTaskId" TEXT,
ADD COLUMN "pmDueCycleKey" TEXT,
ADD COLUMN "pmPlanningSnapshot" TEXT;

CREATE INDEX "pm_schedule_tasks_scheduleId_isActive_lastGeneratedCycleKey_idx"
ON "pm_schedule_tasks"("scheduleId", "isActive", "lastGeneratedCycleKey");

CREATE INDEX "wo_task_executions_pmScheduleTaskId_pmDueCycleKey_idx"
ON "wo_task_executions"("pmScheduleTaskId", "pmDueCycleKey");

ALTER TABLE "wo_task_executions"
ADD CONSTRAINT "wo_task_executions_pmScheduleTaskId_fkey"
FOREIGN KEY ("pmScheduleTaskId") REFERENCES "pm_schedule_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
