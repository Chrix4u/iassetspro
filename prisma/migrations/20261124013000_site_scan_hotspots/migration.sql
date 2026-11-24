-- Spatial site-scan inspection markers use registered components without
-- asserting that a photogrammetry surface is a manufacturer CAD part.
CREATE TABLE "site_scan_hotspots" (
  "id" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sourceMeshPath" TEXT,
  "positionX" DOUBLE PRECISION NOT NULL,
  "positionY" DOUBLE PRECISION NOT NULL,
  "positionZ" DOUBLE PRECISION NOT NULL,
  "isApproved" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "site_scan_hotspots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "site_scan_hotspots_modelId_isApproved_idx" ON "site_scan_hotspots"("modelId", "isApproved");
CREATE INDEX "site_scan_hotspots_assetId_idx" ON "site_scan_hotspots"("assetId");
CREATE INDEX "site_scan_hotspots_componentId_idx" ON "site_scan_hotspots"("componentId");
ALTER TABLE "site_scan_hotspots" ADD CONSTRAINT "site_scan_hotspots_modelId_fkey"
  FOREIGN KEY ("modelId") REFERENCES "asset_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_scan_hotspots" ADD CONSTRAINT "site_scan_hotspots_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_scan_hotspots" ADD CONSTRAINT "site_scan_hotspots_componentId_fkey"
  FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
