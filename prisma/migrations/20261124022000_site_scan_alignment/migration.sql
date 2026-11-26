-- Immutable, engineer-reviewed correspondence of one registered installed
-- machine's source CAD and an as-built LiDAR/photogrammetry scan.
CREATE TABLE "site_scan_alignments" (
  "id" TEXT NOT NULL,
  "scanModelId" TEXT NOT NULL,
  "cadModelId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "landmarks" TEXT NOT NULL,
  "translationX" DOUBLE PRECISION NOT NULL,
  "translationY" DOUBLE PRECISION NOT NULL,
  "translationZ" DOUBLE PRECISION NOT NULL,
  "rotationX" DOUBLE PRECISION NOT NULL,
  "rotationY" DOUBLE PRECISION NOT NULL,
  "rotationZ" DOUBLE PRECISION NOT NULL,
  "rotationW" DOUBLE PRECISION NOT NULL,
  "rmsErrorMetres" DOUBLE PRECISION NOT NULL,
  "maxErrorMetres" DOUBLE PRECISION NOT NULL,
  "maxRelativeDistanceError" DOUBLE PRECISION NOT NULL,
  "isApproved" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "site_scan_alignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "site_scan_alignments_scanModelId_key" ON "site_scan_alignments"("scanModelId");
CREATE INDEX "site_scan_alignments_cadModelId_idx" ON "site_scan_alignments"("cadModelId");
CREATE INDEX "site_scan_alignments_assetId_isApproved_idx" ON "site_scan_alignments"("assetId","isApproved");
ALTER TABLE "site_scan_alignments" ADD CONSTRAINT "site_scan_alignments_scanModelId_fkey"
  FOREIGN KEY ("scanModelId") REFERENCES "asset_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_scan_alignments" ADD CONSTRAINT "site_scan_alignments_cadModelId_fkey"
  FOREIGN KEY ("cadModelId") REFERENCES "asset_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_scan_alignments" ADD CONSTRAINT "site_scan_alignments_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
