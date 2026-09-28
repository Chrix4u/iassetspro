-- Allow a maintenance request to target the exact machine component or part.
ALTER TABLE "maintenance_requests"
  ADD COLUMN "componentRegistryId" TEXT;

CREATE INDEX "maintenance_requests_componentRegistryId_idx"
  ON "maintenance_requests"("componentRegistryId");

ALTER TABLE "maintenance_requests"
  ADD CONSTRAINT "maintenance_requests_componentRegistryId_fkey"
  FOREIGN KEY ("componentRegistryId")
  REFERENCES "component_registry"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
