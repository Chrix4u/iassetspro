-- Canonical PM recurrence metadata.
ALTER TABLE "pm_schedules"
  ADD COLUMN "frequencyUnit" TEXT,
  ADD COLUMN "meterName" TEXT;

-- `custom_hours` was historically routed through the usage-meter engine, but
-- the canonical product contract now treats hours as a Time/Day unit. Preserve
-- the interval, derive the first calendar due timestamp from the best known
-- schedule anchor, and retain (but deactivate) the old meter trigger for audit.
UPDATE "pm_triggers"
SET "isActive" = FALSE,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "triggerType" = 'meter'
  AND "scheduleId" IN (
    SELECT "id" FROM "pm_schedules" WHERE "frequencyType" = 'custom_hours'
  );

UPDATE "pm_schedules"
SET "frequencyType" = 'time_day',
    "frequencyUnit" = 'hours',
    "meterName" = NULL,
    "nextDueDate" = COALESCE(
      "nextDueDate",
      COALESCE("lastCompletedDate", "createdAt") + ("frequencyValue" * INTERVAL '1 hour')
    )
WHERE "frequencyType" = 'custom_hours';
