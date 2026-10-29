# PM Compliance Intelligence Design

**Date:** 2026-10-29

## Goal

Add trustworthy preventive-maintenance compliance and overdue intelligence to the direct PM assignment workflow without introducing a second PM history store or a schema migration.

## Scope for this slice

This slice adds machine-level historical PM compliance to the existing Machine PM Roll-up. It answers:

- How many direct PM cycles matured in the selected reporting window?
- How many were completed?
- How many are still open after becoming due?
- How many were missed through a cancelled/failed/skipped outcome?
- What is the completion-compliance percentage?
- Which recent cycles explain the KPI totals?

Plant/department portfolio ranking and cross-machine trend dashboards are a follow-on slice built on the same service contract.

## Source of truth

Use existing `WorkOrderTaskExecution` records created by `materializePmScheduledTasks()` for direct PM assignments. Every materialized direct-PM task already stores:

- `pmScheduleTaskId`
- stable `pmDueCycleKey`
- immutable `pmPlanningSnapshot`
- execution `status`
- `completedAt`
- linked work-order status and identity

The immutable planning snapshot already contains the recurrence mode and TBM `nextDueDate`, so no new PM compliance table is needed.

## Cycle identity and deduplication

A compliance cycle is keyed by:

`pmScheduleTaskId + pmDueCycleKey`

A cycle can have more than one execution attempt when an earlier work order was cancelled or a formally skipped cycle was released for replanning. Compliance must count the cycle once, not each attempt.

Outcome precedence for duplicate attempts:

1. If any attempt is `completed`, the cycle is **completed**.
2. Otherwise, if any attempt belongs to a non-cancelled work order and its task is not terminal-missed, the cycle is **overdue_open** once its due instant has passed.
3. Otherwise the cycle is **missed**.

This makes retries/replanning idempotent from a management-reporting perspective.

## Due instant

For TBM assignments, use the immutable planning snapshot `nextDueDate` when valid.

For UBM/CBM/FBM assignments, use the task execution `createdAt` as the trigger-due instant because those cycles are materialized only after the due engine confirms the trigger condition.

For malformed or legacy snapshots, fall back to `createdAt` rather than dropping the record.

## Reporting window

The API accepts `windowDays`, normalized to 1–365, default 30. The window is `[now - windowDays, now]` and cycle membership is determined by its derived due instant.

Future-due records are excluded. Historical cycles before the window are excluded even if a retry was created later.

## KPI semantics

- **Matured Cycles**: unique PM cycles whose due instant falls inside the reporting window and is not in the future.
- **Completed**: matured cycles with at least one completed execution attempt.
- **Open Overdue**: matured cycles that are not completed and still have an active/non-cancelled execution path after their due instant.
- **Missed**: matured cycles with no completion and only terminal-missed attempts (`failed`, `skipped`, or cancelled work orders).
- **Completion Compliance**: `completed / maturedCycles * 100`, rounded to one decimal. If no cycles matured, return `null` rather than an artificial 100%.

Open overdue work intentionally reduces compliance because a due PM cycle has matured but has not been completed.

## Drill-down contract

Return one row per unique cycle with:

- cycle identity
- task number and description
- PM type / maintenance mode
- due instant
- outcome (`completed`, `overdue_open`, `missed`)
- completion time when available
- work-order id/number/status for the selected representative attempt
- delay minutes for completed or still-open overdue work

Rows are sorted by due instant descending so the UI shows the most recent exposure first.

## UI

Extend `PmMachineRollupPanel` rather than the very large `MaintenancePages.tsx`.

Under the live Due/Near Due/Running/Standstill area, add a **PM Compliance** section with:

- reporting-window selector: 30 / 90 / 180 / 365 days
- Completion Compliance percentage
- Matured Cycles
- Completed
- Open Overdue
- Missed
- compact recent-cycle drill-down table

The live roll-up remains responsible for current due planning and bundling; compliance remains historical. This separation avoids mixing forecast counts with completed history.

## API and authorization

Add `GET /api/pm-assignments/compliance?assetId=<id>&windowDays=<n>`.

Use the same authentication and strict plant-scope checks as the existing roll-up endpoint. Never infer access from a work-order row alone.

## Failure behavior

- missing asset id → 400
- unauthenticated → 401
- asset outside plant scope → 403
- missing asset → 404
- malformed planning snapshot → keep cycle, use fallback due instant
- duplicate attempts → collapse to one cycle
- no matured cycles → zero counts and `completionCompliancePct: null`

## Non-goals

- no schema migration in this slice
- no new scheduler behavior
- no change to PM recurrence advancement
- no automatic escalation/notification yet
- no plant-wide or department-wide league tables yet
