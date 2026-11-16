-- First-class usage meters can belong to a registered machine part, while remaining
-- readable by the existing asset-level PM generation and reading engines.
ALTER TABLE "asset_meters" ADD COLUMN "componentId" TEXT;
CREATE INDEX "asset_meters_componentId_idx" ON "asset_meters"("componentId");
ALTER TABLE "asset_meters" ADD CONSTRAINT "asset_meters_componentId_fkey"
  FOREIGN KEY ("componentId") REFERENCES "component_registry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
