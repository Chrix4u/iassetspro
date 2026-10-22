-- Add nullable ownership/provenance columns first so existing PM data remains valid.
ALTER TABLE "pm_templates" ADD COLUMN "plantId" TEXT;
ALTER TABLE "pm_template_tasks" ADD COLUMN "pmTaskId" TEXT;

-- A template is safely assignable only when every schedule currently using it
-- resolves to one and the same asset plant. Templates with no schedules, or
-- schedules spanning multiple plants, remain explicitly unassigned.
WITH single_plant_templates AS (
    SELECT
        s."templateId",
        MIN(a."plantId") AS "plantId"
    FROM "pm_schedules" s
    INNER JOIN "assets" a ON a."id" = s."assetId"
    WHERE s."templateId" IS NOT NULL
    GROUP BY s."templateId"
    HAVING COUNT(DISTINCT a."plantId") = 1
)
UPDATE "pm_templates" pt
SET "plantId" = sp."plantId"
FROM single_plant_templates sp
WHERE pt."id" = sp."templateId"
  AND pt."plantId" IS NULL;

-- Backfill one Task Master per deterministically convertible legacy template row.
-- Deliberately do not deduplicate descriptions: identical text can represent
-- distinct maintenance definitions. Unsupported/ambiguous categories stay legacy.
WITH eligible AS (
    SELECT
        pmt."id" AS "associationId",
        pmt."templateId" AS "templateId",
        pt."plantId" AS "plantId",
        pt."createdById" AS "createdById",
        pmt."description" AS "description",
        LOWER(BTRIM(pt."category")) AS "discipline",
        pmt."sortOrder" AS "sortOrder",
        pmt."taskNumber" AS "taskNumber",
        pmt."isActive" AS "isActive"
    FROM "pm_template_tasks" pmt
    INNER JOIN "pm_templates" pt ON pt."id" = pmt."templateId"
    WHERE pt."plantId" IS NOT NULL
      AND pmt."pmTaskId" IS NULL
      AND LOWER(BTRIM(pt."category")) IN ('mechanical', 'electrical', 'plumbing', 'lubrication')
),
plant_max AS (
    SELECT t."plantId", COALESCE(MAX(t."taskNumber"), 0) AS "maxTaskNumber"
    FROM "pm_tasks" t
    GROUP BY t."plantId"
),
numbered AS (
    SELECT
        e.*,
        (
            COALESCE(pm."maxTaskNumber", 0)
            + ROW_NUMBER() OVER (
                PARTITION BY e."plantId"
                ORDER BY e."plantId", e."templateId", e."sortOrder", e."taskNumber", e."associationId"
            )
        )::INTEGER AS "newTaskNumber"
    FROM eligible e
    LEFT JOIN plant_max pm ON pm."plantId" = e."plantId"
)
INSERT INTO "pm_tasks" (
    "id", "plantId", "taskNumber", "description", "taskType", "isActive",
    "createdById", "createdAt", "updatedAt"
)
SELECT
    'legacy-pm-task-' || n."associationId",
    n."plantId",
    n."newTaskNumber",
    n."description",
    n."discipline",
    n."isActive",
    n."createdById",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM numbered n;

WITH inserted_links AS (
    SELECT
        pmt."id" AS "associationId",
        'legacy-pm-task-' || pmt."id" AS "pmTaskId"
    FROM "pm_template_tasks" pmt
    INNER JOIN "pm_templates" pt ON pt."id" = pmt."templateId"
    WHERE pt."plantId" IS NOT NULL
      AND pmt."pmTaskId" IS NULL
      AND LOWER(BTRIM(pt."category")) IN ('mechanical', 'electrical', 'plumbing', 'lubrication')
)
UPDATE "pm_template_tasks" pmt
SET "pmTaskId" = i."pmTaskId"
FROM inserted_links i
WHERE pmt."id" = i."associationId";

CREATE INDEX "pm_templates_plantId_isActive_idx" ON "pm_templates"("plantId", "isActive");
CREATE UNIQUE INDEX "pm_template_tasks_templateId_pmTaskId_key" ON "pm_template_tasks"("templateId", "pmTaskId");
CREATE INDEX "pm_template_tasks_pmTaskId_idx" ON "pm_template_tasks"("pmTaskId");

ALTER TABLE "pm_templates"
ADD CONSTRAINT "pm_templates_plantId_fkey"
FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pm_template_tasks"
ADD CONSTRAINT "pm_template_tasks_pmTaskId_fkey"
FOREIGN KEY ("pmTaskId") REFERENCES "pm_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
