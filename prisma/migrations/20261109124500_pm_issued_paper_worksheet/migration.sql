-- Additive, immutable issue registry: existing paper evidence and historical rows are unchanged.
CREATE TABLE "pm_inspection_worksheet_issues" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "equipment_state" TEXT NOT NULL,
    "issued_by_id" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "point_ids" JSONB NOT NULL,
    CONSTRAINT "pm_inspection_worksheet_issues_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pm_inspection_worksheet_issues_reference_key" ON "pm_inspection_worksheet_issues"("reference");
CREATE INDEX "pm_inspection_worksheet_issues_asset_id_issued_at_idx" ON "pm_inspection_worksheet_issues"("asset_id", "issued_at");
CREATE INDEX "pm_inspection_worksheet_issues_plant_id_issued_at_idx" ON "pm_inspection_worksheet_issues"("plant_id", "issued_at");
ALTER TABLE "pm_inspection_worksheet_issues" ADD CONSTRAINT "pm_inspection_worksheet_issues_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pm_inspection_worksheet_issues" ADD CONSTRAINT "pm_inspection_worksheet_issues_issued_by_id_fkey"
  FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
