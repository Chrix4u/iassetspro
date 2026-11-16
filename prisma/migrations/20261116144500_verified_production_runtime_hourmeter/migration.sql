-- Optional verified cumulative hour-meter observations; do not infer from productive minutes.
ALTER TABLE "production_shift_records"
  ADD COLUMN "runtimeMeterId" TEXT,
  ADD COLUMN "runtimeCounterHours" DOUBLE PRECISION,
  ADD COLUMN "runtimeEvidence" VARCHAR(255),
  ADD COLUMN "runtimeMeterReadingId" TEXT;

ALTER TABLE "production_shift_records" ADD CONSTRAINT "production_shift_records_runtime_pair_chk" CHECK (
  ("runtimeMeterId" IS NULL AND "runtimeCounterHours" IS NULL AND "runtimeEvidence" IS NULL)
  OR ("runtimeMeterId" IS NOT NULL AND "runtimeCounterHours" IS NOT NULL AND "runtimeEvidence" IS NOT NULL
    AND "runtimeCounterHours" >= 0 AND "runtimeCounterHours" < 1000000000000 AND "runtimeEvidence" <> '')
);
CREATE UNIQUE INDEX "production_shift_records_runtimeMeterReadingId_key" ON "production_shift_records"("runtimeMeterReadingId");
CREATE INDEX "production_shift_records_runtimeMeterId_status_idx" ON "production_shift_records"("runtimeMeterId","status");
ALTER TABLE "production_shift_records" ADD CONSTRAINT "production_shift_records_runtimeMeterId_fkey"
  FOREIGN KEY ("runtimeMeterId") REFERENCES "asset_meters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_shift_records" ADD CONSTRAINT "production_shift_records_runtimeMeterReadingId_fkey"
  FOREIGN KEY ("runtimeMeterReadingId") REFERENCES "meter_readings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
