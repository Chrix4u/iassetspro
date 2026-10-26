# iAssetsPro PM Task-Level Closeout Recurrence Design

Date: 2026-10-26
Status: Approved for autonomous implementation under the existing PM Task-Level Scheduling design

## 1. Purpose

Complete the task-level PM lifecycle by making canonical Repairs/RWOP planner closeout the only authority that advances Scheduled Task recurrence, then enable normal automatic generation for task-level schedules.

This slice closes the safety gap intentionally left by the task-level due-generation release: generation can create canonical preventive work orders and immutable task snapshots, but generation itself must never claim maintenance was completed.

## 2. Binding lifecycle rule

A Scheduled Task advances only when all of the following are true:

1. The generated Work Order reaches canonical Repairs `closed` through technician completion, supervisor verification, and planner closeout.
2. The Work Order task execution carries canonical task-level PM provenance (`pmDueCycleKey` / Scheduled Task link).
3. That individual execution is `completed`.

`skipped`, `pending`, `in_progress`, or `failed` task executions never advance recurrence. Completion, verification, rework, cancellation, generation, or mere WO existence never independently advance recurrence.

Planner closeout remains transactional: if a completed Scheduled Task cannot safely advance its live recurrence state, the close transaction fails rather than closing the WO with silently stale maintenance planning state.

## 3. Task-level versus legacy ownership

Task-level provenance on a Work Order is authoritative. If any checklist execution carries task-level PM cycle provenance, the Work Order is treated as task-level even if a live Scheduled Task relation was later removed.

For task-level WOs:

- advance only completed, live Scheduled Tasks linked to that exact WO;
- do not advance the parent `PmSchedule` legacy header recurrence;
- skipped rows remain due;
- a completed row whose live Scheduled Task is missing or belongs to a different PM Schedule is a closeout integrity error.

For WOs with no task-level provenance, retain the existing legacy schedule-header closeout path unchanged.

## 4. Completion timestamp

Each task uses its own `WorkOrderTaskExecution.completedAt` when available. If historical data lacks that timestamp, fall back to the WO `actualEnd`, then planner close time.

This keeps task cadence aligned with when the work was actually completed instead of shifting due dates because supervisor/planner review happened later.

## 5. TBM recurrence

For a completed TBM Scheduled Task:

- set `lastCompletedAt` to the task completion timestamp;
- calculate `nextDueDate` from that timestamp using the task's interval and unit;
- preserve calendar-safe month/year arithmetic;
- never mutate `nextDueReading`.

TBM units are days, weeks, months, or years and use whole-number intervals, consistent with the task-level UI. Invalid persisted cadence fails closeout instead of silently defaulting to another interval.

## 6. UBM recurrence

For a completed UBM Scheduled Task:

- set `lastCompletedAt` to the task completion timestamp;
- resolve the latest authoritative asset meter reading for the configured meter name/unit at or before that completion timestamp;
- set `nextDueReading = completionBaselineReading + frequencyInterval`;
- never invent a calendar due date.

Using a reading at/before completion prevents supervisor/planner review delay or post-maintenance usage from artificially shifting the maintenance cadence. If the configured meter or a suitable reading is unavailable, closeout fails safely rather than fabricating a threshold.

## 7. CBM re-arm semantics

For a completed CBM Scheduled Task:

- set `lastCompletedAt` to the task completion timestamp;
- leave condition thresholds/source configuration unchanged;
- do not create a calendar or meter threshold.

After closeout, CBM due evaluation requires a source observation strictly newer than `lastCompletedAt`. A stale pre-maintenance bad reading cannot create a fresh cycle simply because `lastCompletedAt` changed.

A post-completion reading that still violates the condition is allowed to create a new cycle: that represents a genuinely unresolved/new condition after maintenance.

## 8. Skipped-task regeneration

Repairs readiness permits formally skipped checklist tasks. A skipped PM task therefore needs explicit generation semantics:

- while its WO is open/non-cancelled, the existing task cycle blocks duplicate generation;
- after the WO is `closed` with that execution still `skipped`, the same due cycle is no longer considered materialized successfully and may generate again;
- a closed `completed` execution remains a blocker for its old cycle as a safety net, although normal closeout will have advanced recurrence to a new cycle;
- cancelled WOs remain non-blocking as before.

The duplicate-cycle rule is centralized so candidate filtering and final materialization cannot disagree.

## 9. Auditability

Each advanced Scheduled Task writes an audit event containing at minimum:

- Scheduled Task ID;
- Work Order ID / number;
- due-cycle key;
- maintenance mode;
- old and new `lastCompletedAt`;
- old/new `nextDueDate` for TBM;
- old/new `nextDueReading` plus meter baseline identity/value for UBM;
- closeout actor.

The Work Order close audit retains existing legacy `pmScheduleAdvanced` compatibility and adds task-level advancement counts/IDs.

## 10. Automatic generation cutover

Once the closeout rules above are implemented and verified:

- task-level PM schedule POST/PUT may persist the user's `autoGenerateWO` choice;
- default remains enabled when omitted, matching the existing schedule form default;
- the PM schedule UI exposes one common **Auto-generate Work Orders** switch for both legacy and task-level schedules;
- task-level automatic runs use `generateDueScheduledTaskWorkOrders`;
- the legacy due engine continues to query only schedules with no Scheduled Tasks (`tasks: { none: {} }`).

No task-level schedule is routed back into legacy recurrence generation.

## 11. Data model and migration

No schema migration is required for this slice. Existing fields are sufficient:

- `PmScheduleTask.lastCompletedAt`, `nextDueDate`, `nextDueReading`;
- `WorkOrderTaskExecution.pmScheduleTaskId`, `pmDueCycleKey`, `pmPlanningSnapshot`, `status`, `completedAt`.

Historical planning snapshots remain immutable.

## 12. Release gates

The release must prove:

- TBM, UBM, and CBM closeout recurrence independently;
- skipped task does not advance and can regenerate after close;
- stale CBM readings cannot retrigger;
- rework/unclosed WOs cannot advance recurrence;
- task-level WOs never mutate legacy parent recurrence;
- legacy WOs retain existing closeout cadence behavior;
- task-level `autoGenerateWO` works through API and UI;
- isolated PostgreSQL/Redis Repairs UAT, Platform E2E, build/container, lint, TypeScript, Vitest, and Required CI Gate are green on the exact PR head before merge.
