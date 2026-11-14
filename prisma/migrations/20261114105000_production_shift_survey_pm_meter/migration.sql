-- Controlled production survey posting to usage-based PM. No existing records are rewritten.
CREATE TABLE "production_shift_templates" (
  "id" TEXT NOT NULL,
  "plantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startsAt" TEXT,
  "endsAt" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_shift_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "production_shift_templates_plantId_code_key" ON "production_shift_templates"("plantId", "code");
CREATE INDEX "production_shift_templates_plantId_isActive_sortOrder_idx" ON "production_shift_templates"("plantId","isActive","sortOrder");
ALTER TABLE "production_shift_templates" ADD CONSTRAINT "production_shift_templates_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "production_shift_records" (
  "id" TEXT NOT NULL,
  "plantId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "shiftTemplateId" TEXT NOT NULL,
  "productionDate" DATE NOT NULL,
  "outputQuantity" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "targetQuantity" DOUBLE PRECISION,
  "availableMinutes" INTEGER NOT NULL,
  "breakMinutes" INTEGER NOT NULL DEFAULT 0,
  "repairMinutes" INTEGER NOT NULL DEFAULT 0,
  "inputDeliveryMinutes" INTEGER NOT NULL DEFAULT 0,
  "changeoverMinutes" INTEGER NOT NULL DEFAULT 0,
  "startupCleaningMinutes" INTEGER NOT NULL DEFAULT 0,
  "otherMinutes" INTEGER NOT NULL DEFAULT 0,
  "preventiveMinutes" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "reviewNote" TEXT,
  "assetMeterId" TEXT,
  "meterReadingId" TEXT,
  "recordedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_shift_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "production_shift_records_valid_quantities" CHECK ("outputQuantity" >= 0 AND ("targetQuantity" IS NULL OR "targetQuantity" >= 0) AND "outputQuantity" < 1000000000000),
  CONSTRAINT "production_shift_records_valid_minutes" CHECK ("availableMinutes" BETWEEN 0 AND 1440 AND "breakMinutes" >= 0 AND "repairMinutes" >= 0 AND "inputDeliveryMinutes" >= 0 AND "changeoverMinutes" >= 0 AND "startupCleaningMinutes" >= 0 AND "otherMinutes" >= 0 AND "preventiveMinutes" >= 0 AND ("breakMinutes"+"repairMinutes"+"inputDeliveryMinutes"+"changeoverMinutes"+"startupCleaningMinutes"+"otherMinutes"+"preventiveMinutes") <= "availableMinutes"),
  CONSTRAINT "production_shift_records_valid_status" CHECK ("status" IN ('submitted','approved','rejected'))
);
CREATE UNIQUE INDEX "production_shift_records_meterReadingId_key" ON "production_shift_records"("meterReadingId");
CREATE UNIQUE INDEX "production_shift_records_assetId_productionDate_shiftTemplateId_key" ON "production_shift_records"("assetId", "productionDate", "shiftTemplateId");
CREATE INDEX "production_shift_records_plantId_productionDate_status_idx" ON "production_shift_records"("plantId", "productionDate", "status");
CREATE INDEX "production_shift_records_assetMeterId_status_idx" ON "production_shift_records"("assetMeterId", "status");
ALTER TABLE "production_shift_records" ADD CONSTRAINT "production_shift_records_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_shift_records" ADD CONSTRAINT "production_shift_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_shift_records" ADD CONSTRAINT "production_shift_records_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "production_shift_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_shift_records" ADD CONSTRAINT "production_shift_records_assetMeterId_fkey" FOREIGN KEY ("assetMeterId") REFERENCES "asset_meters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_shift_records" ADD CONSTRAINT "production_shift_records_meterReadingId_fkey" FOREIGN KEY ("meterReadingId") REFERENCES "meter_readings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "production_shift_records" ADD CONSTRAINT "production_shift_records_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_shift_records" ADD CONSTRAINT "production_shift_records_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
