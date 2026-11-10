-- Preserve the exact task/check relationships printed on each issued paper worksheet.
-- Old issued sheets retain NULL: no historical relationship is fabricated.
ALTER TABLE "pm_paper_worksheet_issues" ADD COLUMN "task_point_snapshot" TEXT;
