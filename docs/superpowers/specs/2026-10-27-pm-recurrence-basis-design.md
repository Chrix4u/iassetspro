# PM Task Recurrence Basis Design

## Intent

Allow each task in a task-authority PM Schedule to choose whether time-based recurrence stays on its original calendar cadence or restarts from the actual completion timestamp.

## Behavior

- `fixed_schedule`: TBM recurrence is anchored to the task's current due cycle. Planner closeout advances to the first cadence occurrence strictly after the verified task completion time, preserving the original minute/hour/day/week/month/year schedule rather than drifting with lateness.
- `after_completion`: TBM recurrence keeps the existing behavior and calculates the next due date from the verified completion timestamp.
- UBM remains meter-baseline based and CBM remains condition-rearm based; recurrence basis does not alter those engines.
- Existing persisted Scheduled Tasks must retain current behavior. Migration therefore backfills/defaults existing rows to `after_completion`.
- Newly added calendar/TBM tasks in the modern PM schedule form default to `fixed_schedule`.
- The planner may change a TBM task between Fixed Schedule and After Completion.

## Fixed-schedule catch-up rule

If a task is completed after one or more cadence points have already passed, do not generate an immediate backlog chain from that completed cycle. Advance to the first cadence point strictly after completion while preserving the original due anchor. Example: weekly Monday 08:00 due, completed Tuesday -> next Monday 08:00. If completed three weeks late -> the first Monday 08:00 after completion.

## UI

Keep the existing eight-column compact task planning grid unchanged. For TBM tasks, show a compact secondary `Recurrence Basis` selector beneath the grid with:

- `Fixed Schedule` — keep the planned calendar clock.
- `After Completion` — restart the interval when this task is completed.

Hide/disable this choice for UBM and CBM because their recurrence semantics are already defined by meter/condition data.

## Safety

- No schedule-level recurrence semantics change.
- No historical Work Orders or task executions are rewritten.
- Skipped/failed/pending task executions still do not advance recurrence.
- Duplicate due-cycle protection remains unchanged.
- Audit history records the selected recurrence basis and resulting next due date at closeout.
