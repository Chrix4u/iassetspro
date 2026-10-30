ALTER TABLE "asset_mesh_bindings" ADD COLUMN "componentId" TEXT;

CREATE INDEX "asset_mesh_bindings_componentId_idx" ON "asset_mesh_bindings"("componentId");

ALTER TABLE "asset_mesh_bindings"
ADD CONSTRAINT "asset_mesh_bindings_componentId_fkey"
FOREIGN KEY ("componentId") REFERENCES "component_registry"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
