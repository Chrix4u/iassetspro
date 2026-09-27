CREATE TABLE IF NOT EXISTS "component_visuals" (
  "id" TEXT NOT NULL,
  "assetId" TEXT,
  "componentId" TEXT,
  "visualType" TEXT NOT NULL DEFAULT 'ai_realistic',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "imageUrl" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "hotspotData" TEXT,
  "cameraData" TEXT,
  "sourceProvider" TEXT,
  "sourcePrompt" TEXT,
  "zoomLevel" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "generatedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "component_visuals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "component_visuals_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "component_visuals_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "component_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "component_visuals_assetId_idx" ON "component_visuals"("assetId");
CREATE INDEX IF NOT EXISTS "component_visuals_componentId_idx" ON "component_visuals"("componentId");
CREATE INDEX IF NOT EXISTS "component_visuals_visualType_idx" ON "component_visuals"("visualType");
CREATE INDEX IF NOT EXISTS "component_visuals_isPrimary_idx" ON "component_visuals"("isPrimary");

ALTER TABLE "component_visuals"
  ADD CONSTRAINT "component_visuals_target_check"
  CHECK ("assetId" IS NOT NULL OR "componentId" IS NOT NULL);
