-- Link refurbishment/return custody to the exact installed physical spare.
ALTER TABLE "spare_part_returns" ADD COLUMN "installedSparePartId" TEXT;

CREATE UNIQUE INDEX "spare_part_returns_installedSparePartId_key"
  ON "spare_part_returns"("installedSparePartId");

ALTER TABLE "spare_part_returns"
  ADD CONSTRAINT "spare_part_returns_installedSparePartId_fkey"
  FOREIGN KEY ("installedSparePartId") REFERENCES "installed_spare_parts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
