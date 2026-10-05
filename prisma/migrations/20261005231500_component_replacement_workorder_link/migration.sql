ALTER TABLE "component_replacement_history"
  ADD COLUMN "workOrderId" TEXT;

CREATE INDEX "component_replacement_history_workOrderId_idx"
  ON "component_replacement_history"("workOrderId");

ALTER TABLE "component_replacement_history"
  ADD CONSTRAINT "component_replacement_history_workOrderId_fkey"
  FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
