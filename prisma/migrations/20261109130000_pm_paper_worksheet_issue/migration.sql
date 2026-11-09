-- Create an immutable register of paper checklists issued for physical inspection.
CREATE TABLE IF NOT EXISTS "pm_paper_worksheet_issues" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "request_key" TEXT NOT NULL,
 "reference" TEXT NOT NULL,
 "assetId" TEXT NOT NULL,
 "plantId" TEXT NOT NULL,
 "machineCode" TEXT NOT NULL,
 "equipmentState" TEXT NOT NULL,
 "issuedById" TEXT NOT NULL,
 "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "pointIds" TEXT NOT NULL,
 "taskIds" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "pm_paper_worksheet_issues_request_key_key" ON "pm_paper_worksheet_issues"("request_key");
CREATE UNIQUE INDEX IF NOT EXISTS "pm_paper_worksheet_issues_reference_key" ON "pm_paper_worksheet_issues"("reference");
CREATE INDEX IF NOT EXISTS "pm_paper_worksheet_issues_assetId_issuedAt_idx" ON "pm_paper_worksheet_issues"("assetId","issuedAt");
CREATE INDEX IF NOT EXISTS "pm_paper_worksheet_issues_plantId_issuedAt_idx" ON "pm_paper_worksheet_issues"("plantId","issuedAt");
