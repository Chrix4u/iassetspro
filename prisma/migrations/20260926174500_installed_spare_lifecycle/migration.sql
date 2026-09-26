-- Installed spare lifecycle: track physical parts installed on machine components
CREATE TABLE "installed_spare_parts" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "materialRequestId" TEXT,
    "workOrderId" TEXT,
    "partName" TEXT NOT NULL,
    "partCode" TEXT,
    "serialNumber" TEXT,
    "lotNumber" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'installed',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installedById" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    "removalReason" TEXT,
    "conditionOnRemoval" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installed_spare_parts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "installed_spare_parts_active_serial_key"
ON "installed_spare_parts"("serialNumber")
WHERE "serialNumber" IS NOT NULL AND "status" = 'installed';
CREATE INDEX "installed_spare_parts_componentId_status_idx" ON "installed_spare_parts"("componentId", "status");
CREATE INDEX "installed_spare_parts_inventoryItemId_idx" ON "installed_spare_parts"("inventoryItemId");
CREATE INDEX "installed_spare_parts_materialRequestId_idx" ON "installed_spare_parts"("materialRequestId");
CREATE INDEX "installed_spare_parts_workOrderId_idx" ON "installed_spare_parts"("workOrderId");
CREATE INDEX "installed_spare_parts_installedAt_idx" ON "installed_spare_parts"("installedAt");

ALTER TABLE "installed_spare_parts"
  ADD CONSTRAINT "installed_spare_parts_componentId_fkey"
  FOREIGN KEY ("componentId") REFERENCES "component_registry"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "installed_spare_parts"
  ADD CONSTRAINT "installed_spare_parts_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "installed_spare_parts"
  ADD CONSTRAINT "installed_spare_parts_materialRequestId_fkey"
  FOREIGN KEY ("materialRequestId") REFERENCES "repair_material_requests"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "installed_spare_parts"
  ADD CONSTRAINT "installed_spare_parts_workOrderId_fkey"
  FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "installed_spare_parts"
  ADD CONSTRAINT "installed_spare_parts_installedById_fkey"
  FOREIGN KEY ("installedById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "installed_spare_parts"
  ADD CONSTRAINT "installed_spare_parts_removedById_fkey"
  FOREIGN KEY ("removedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
