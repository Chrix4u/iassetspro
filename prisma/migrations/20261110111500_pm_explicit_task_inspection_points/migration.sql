-- Explicit many-to-many mapping of PM task instructions to actual part checks.
-- Existing part-scoped inspection points and historical inspection records are untouched.
CREATE TABLE "pm_inspection_task_points" (
    "pmTaskId" TEXT NOT NULL,
    "inspectionPointId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "pm_inspection_task_points_pkey" PRIMARY KEY ("pmTaskId","inspectionPointId")
);
CREATE INDEX "pm_inspection_task_points_inspectionPointId_idx" ON "pm_inspection_task_points"("inspectionPointId");
ALTER TABLE "pm_inspection_task_points" ADD CONSTRAINT "pm_inspection_task_points_pmTaskId_fkey"
    FOREIGN KEY ("pmTaskId") REFERENCES "pm_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pm_inspection_task_points" ADD CONSTRAINT "pm_inspection_task_points_inspectionPointId_fkey"
    FOREIGN KEY ("inspectionPointId") REFERENCES "component_inspection_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;
