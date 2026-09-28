-- Restore canonical RP-01 usage-based PM semantics after UAT data drift.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "pm_schedules" WHERE "id"='uat_pm_bearing_500h')
     AND EXISTS (SELECT 1 FROM "pm_triggers" WHERE "id"='uat_pmtrg_bearing_500h') THEN
    UPDATE "pm_schedules"
      SET "frequencyType"='meter_based', "frequencyValue"=500, "autoGenerateWO"=true, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"='uat_pm_bearing_500h';

    UPDATE "pm_triggers"
      SET "triggerType"='meter', "triggerValue"=500, "isActive"=true, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"='uat_pmtrg_bearing_500h';
  END IF;
END $$;


-- Backfill missing meter triggers for existing RP-01 hour-based component schedules.
-- Baseline at current operating hours to avoid retroactive work-order floods.
INSERT INTO "pm_triggers" (
  "id","scheduleId","triggerType","triggerValue","triggerConfig",
  "lastTriggeredAt","isActive","createdAt","updatedAt"
)
SELECT
  'uat_pmtrg_' || substr(md5(p."id"), 1, 16),
  p."id",
  'meter',
  p."frequencyValue",
  json_build_object(
    'source','component_operating_hours',
    'componentId',p."componentId",
    'baselineHours',c."operatingHours",
    'unit','hours'
  )::text,
  NULL,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "pm_schedules" p
JOIN "component_registry" c ON c."id"=p."componentId"
WHERE p."assetId"='uat_asset_rotary_printer_01'
  AND p."frequencyType"='custom_hours'
  AND p."componentId" IS NOT NULL
  AND p."frequencyValue" > 0
  AND NOT EXISTS (SELECT 1 FROM "pm_triggers" t WHERE t."scheduleId"=p."id");