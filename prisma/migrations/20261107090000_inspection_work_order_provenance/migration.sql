-- Link each inspection-triggered corrective WO to its originating record.
-- Existing records and WOs remain unchanged; optional FK is additive.
ALTER TABLE "component_inspection_records" ADD COLUMN "workOrderId" TEXT;
CREATE UNIQUE INDEX "component_inspection_records_workOrderId_key"
  ON "component_inspection_records"("workOrderId");
ALTER TABLE "component_inspection_records"
  ADD CONSTRAINT "component_inspection_records_workOrderId_fkey"
  FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
