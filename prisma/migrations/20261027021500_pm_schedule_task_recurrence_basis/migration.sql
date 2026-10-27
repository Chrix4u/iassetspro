-- Preserve existing task-level PM semantics while allowing planners to choose
-- fixed calendar cadence for new TBM Scheduled Tasks.
ALTER TABLE "pm_schedule_tasks"
  ADD COLUMN "recurrenceBasis" TEXT NOT NULL DEFAULT 'after_completion',
  ADD COLUMN "recurrenceAnchorDate" TIMESTAMP(3);
