-- Track unusable receipts through quarantine, repair and final disposition without
-- crediting them to usable inventory before an explicit release-to-stock action.
ALTER TABLE "receiving_records"
  ADD COLUMN "custodyStatus" TEXT NOT NULL DEFAULT 'stocked',
  ADD COLUMN "resolution" TEXT,
  ADD COLUMN "dispositionedById" TEXT,
  ADD COLUMN "dispositionNotes" TEXT,
  ADD COLUMN "dispositionedAt" TIMESTAMP(3);

UPDATE "receiving_records"
SET "custodyStatus" = 'quarantined'
WHERE "condition" IN ('damaged', 'defective');

CREATE INDEX "receiving_records_custodyStatus_idx"
  ON "receiving_records"("custodyStatus");

ALTER TABLE "receiving_records"
  ADD CONSTRAINT "receiving_records_dispositionedById_fkey"
  FOREIGN KEY ("dispositionedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
