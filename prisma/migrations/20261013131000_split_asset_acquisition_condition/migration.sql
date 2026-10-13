-- Keep acquisition condition (New/Used) separate from maintenance health condition.
-- Existing `assets.condition` continues to represent maintenance health.
ALTER TABLE "assets" ADD COLUMN "acquisitionCondition" TEXT;

-- Conservative legacy backfill: only assets explicitly marked `new` are treated
-- as new acquisitions; all other existing assets are treated as used.
UPDATE "assets"
SET "acquisitionCondition" = CASE
  WHEN "condition" = 'new' THEN 'new'
  ELSE 'used'
END
WHERE "acquisitionCondition" IS NULL;

ALTER TABLE "assets"
  ALTER COLUMN "acquisitionCondition" SET DEFAULT 'new',
  ALTER COLUMN "acquisitionCondition" SET NOT NULL;

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_acquisitionCondition_check"
  CHECK ("acquisitionCondition" IN ('new', 'used'));
