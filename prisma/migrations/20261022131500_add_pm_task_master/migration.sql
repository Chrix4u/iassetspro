CREATE TABLE "pm_tasks" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "taskNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pm_tasks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pm_tasks_plantId_taskNumber_key" ON "pm_tasks"("plantId", "taskNumber");
CREATE INDEX "pm_tasks_plantId_taskType_isActive_idx" ON "pm_tasks"("plantId", "taskType", "isActive");
ALTER TABLE "pm_tasks" ADD CONSTRAINT "pm_tasks_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pm_tasks" ADD CONSTRAINT "pm_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
