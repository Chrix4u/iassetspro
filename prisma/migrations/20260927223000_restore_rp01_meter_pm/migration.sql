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