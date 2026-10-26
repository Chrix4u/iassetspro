-- Add explicit recurrence authority before introducing legacy compatibility shadow rows.
ALTER TABLE "pm_schedules"
  ADD COLUMN "recurrenceAuthority" TEXT NOT NULL DEFAULT 'legacy_header';

CREATE INDEX "pm_schedules_recurrenceAuthority_isActive_idx"
  ON "pm_schedules"("recurrenceAuthority", "isActive");

-- Schedules already authored through the Scheduled Task editor have task rows and
-- no authoritative header due date. Classify them before creating compatibility
-- shadows. Do not key this classification on autoGenerateWO: task-level generation
-- may legitimately be enabled on current main.
UPDATE "pm_schedules" AS s
SET "recurrenceAuthority" = 'task'
WHERE s."nextDueDate" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "pm_schedule_tasks" existing
    WHERE existing."scheduleId" = s."id"
  );

-- Backfill only deterministic legacy calendar schedules. These rows are compatibility
-- shadows while recurrenceAuthority remains legacy_header; legacy header generation
-- remains authoritative until a planner explicitly resubmits Scheduled Tasks.
WITH eligible_schedules AS (
  SELECT
    s."id",
    s."templateId",
    s."leadDays",
    s."lastCompletedDate",
    s."nextDueDate",
    a."plantId",
    CASE
      WHEN s."frequencyType" = 'biweekly' THEN s."frequencyValue" * 2
      WHEN s."frequencyType" = 'quarterly' THEN s."frequencyValue" * 3
      WHEN s."frequencyType" = 'semiannual' THEN s."frequencyValue" * 6
      ELSE s."frequencyValue"
    END::double precision AS "frequencyInterval",
    CASE
      WHEN s."frequencyType" = 'time_day' THEN s."frequencyUnit"
      WHEN s."frequencyType" IN ('daily', 'custom', 'custom_days') THEN 'days'
      WHEN s."frequencyType" IN ('weekly', 'biweekly') THEN 'weeks'
      WHEN s."frequencyType" IN ('monthly', 'quarterly', 'semiannual') THEN 'months'
      WHEN s."frequencyType" IN ('annual', 'annually', 'yearly') THEN 'years'
      ELSE NULL
    END AS "taskFrequencyUnit"
  FROM "pm_schedules" s
  JOIN "assets" a ON a."id" = s."assetId"
  WHERE s."recurrenceAuthority" = 'legacy_header'
    AND s."templateId" IS NOT NULL
    AND s."nextDueDate" IS NOT NULL
    AND s."frequencyValue" > 0
    AND (
      (s."frequencyType" = 'time_day' AND s."frequencyUnit" IN ('days', 'weeks', 'months', 'years'))
      OR s."frequencyType" IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'annually', 'yearly', 'custom', 'custom_days')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "pm_schedule_tasks" existing
      WHERE existing."scheduleId" = s."id"
    )
)
INSERT INTO "pm_schedule_tasks" (
  "id",
  "scheduleId",
  "pmTaskId",
  "sortOrder",
  "maintenanceMode",
  "equipmentState",
  "estimatedMinutes",
  "leadDays",
  "frequencyInterval",
  "frequencyUnit",
  "lastCompletedAt",
  "nextDueDate",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-tbm-' || s."id" || '-' || pmt."id",
  s."id",
  pmt."pmTaskId",
  pmt."sortOrder",
  'tbm',
  'stopped',
  COALESCE(pmt."estimatedMinutes", 0),
  s."leadDays",
  s."frequencyInterval",
  s."taskFrequencyUnit",
  s."lastCompletedDate",
  s."nextDueDate",
  true,
  NOW(),
  NOW()
FROM eligible_schedules s
JOIN "pm_template_tasks" pmt
  ON pmt."templateId" = s."templateId"
JOIN "pm_tasks" pt
  ON pt."id" = pmt."pmTaskId"
 AND pt."plantId" = s."plantId"
WHERE pmt."isActive" = true
  AND pmt."pmTaskId" IS NOT NULL
  AND pt."isActive" = true
ON CONFLICT ("scheduleId", "pmTaskId") DO NOTHING;
