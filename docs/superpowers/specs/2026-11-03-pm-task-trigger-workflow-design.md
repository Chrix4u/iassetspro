# PM Task Trigger Workflow Design

## Intent

Make PM assignment authoring explicit and easy to follow after planners assign maintenance tasks to a machine or exact part. Today the trigger fields already exist on each direct PM task assignment, but they are mixed into the same dense task form, so the workflow does not clearly answer the planner’s next question: **“I assigned these tasks to this part — how do I now define when each task should trigger?”**

## Goals

- Make the authoring sequence visibly **Tasks → Triggers**.
- Keep trigger ownership at the **individual assigned task** level, not at the whole part level.
- Let planners reopen trigger configuration directly from the PM Schedule target list without rebuilding the task assignment.
- Reuse the existing TBM / UBM / CBM / FBM fields, validation, due engine, cron automation, plant scope, and work-order generation path.
- Show trigger readiness clearly for every task before save.
- Keep the workflow responsive on phone, tablet, and desktop.

## Non-goals

- No new Prisma schema or trigger table for direct PM assignments.
- No second scheduling clock for TBM tasks.
- No repurposing of the standalone `PmTriggersPage` for direct task assignments.
- No change to the existing due semantics or PM work-order bundling engine.
- No change to schedule-level runtime triggers used by conventional PM schedules.

## Current Architecture

Direct PM assignments are persisted as `pmScheduleTask` rows with `scheduleId: null`. Each assignment already owns its own frequency/trigger fields: PM type, frequency type/unit/value, meter, next due date, lead days, and condition-source configuration.

The direct-assignment due engine already evaluates those task records independently:

- **TBM** — due from `nextDueDate` and lead days; calendar recurrence stays authoritative on the task assignment.
- **UBM** — due when the selected asset meter reaches the task’s next due reading.
- **CBM** — due when the configured condition source/operator/threshold becomes active, subject to the configured cadence and edge/cycle safeguards.
- **FBM** — does not use a recurring interval; it waits for the failure/event path.

The server-owned PM automation runner delegates due evaluation into the direct-assignment generation path, and due task assignments are bundled into PM work orders. This runtime is already production-capable; this feature exposes it coherently in the planner workflow rather than creating another engine.

## Approaches Considered

### 1. Reuse the standalone PM Triggers page for direct assignments

Rejected. That page is schedule-centric and expects a `scheduleId`; direct task assignments intentionally have `scheduleId: null`. Forcing direct assignments into it would blur two data models and risks reintroducing competing scheduling clocks.

### 2. Keep all task and trigger fields mixed together in the existing task cards

Rejected. The current form technically stores trigger data, but it does not provide the workflow the planner expects after assigning tasks to parts. It also makes it difficult to see which tasks still need trigger configuration.

### 3. Two-step assignment dialog with a direct Triggers entry point

Selected. The assignment dialog becomes a clear two-step workflow while still writing the same direct-assignment payload. The PM Schedule list gets a dedicated **Triggers** action that opens the existing assignment target directly on the trigger step.

## User Experience

### Step 1 — Tasks

The dialog shows the selected machine/part target and the assigned task list. Planners can add/reorder/remove tasks and edit execution metadata such as activity mode, inspection type, and estimated minutes.

Primary action: **Continue to Triggers**.

If no tasks exist, the planner cannot continue to trigger setup.

### Step 2 — Triggers

The same assigned tasks are shown as trigger cards. Each card presents only trigger-relevant fields and a readiness badge.

- TBM: interval/unit, next due date, lead days.
- UBM: meter, interval, lead days / computed due-reading context where already supported.
- CBM: authoritative condition source, operator, threshold/range, unit, cadence.
- FBM: explicit message that the task is failure/event driven and has no recurring interval.

The top of the step summarizes `Ready X / Y` and identifies tasks requiring setup.

Actions: **Back to Tasks** and **Save PM Schedule**.

### Reopening triggers

Each target row on the PM Schedule page gets a **Triggers** action. It opens the assignment dialog for that target with the trigger step selected immediately. The existing View/Edit/Delete capabilities remain available; task editing still opens on the Tasks step.

## Validation and Readiness

Add a trigger-specific validation/readiness helper for UI status. It should validate only the trigger configuration for the selected PM type, while the existing full task validation remains the final save authority.

Trigger readiness rules:

- TBM requires a positive whole interval, a supported time unit, and next due date.
- UBM requires a positive interval and an asset meter belonging to the selected asset.
- CBM requires a source/metric and valid numeric threshold configuration; outside-range requires a valid upper threshold greater than the lower threshold.
- FBM is trigger-ready when the task itself exists because recurrence is intentionally event driven.

## Runtime and Automation

No new runtime service is introduced. Saving the dialog continues to use `/api/pm-assignments` or `/api/pm-assignments/target`. The existing PM automation path remains authoritative for TBM/UBM/CBM direct assignments, and the existing failure/event path remains authoritative for FBM.

The UI must not imply that configuring a trigger creates an immediate work order. It configures when the automation engine considers that specific task due.

## Security and Data Integrity

All existing plant, asset, component, meter, and PM-task validation stays in force. The workflow must not bypass the existing batch create/target replace services. A trigger action can only edit the same target group the planner already has access to.

## Responsive Behavior

The two-step dialog uses the existing responsive dialog foundation. Task and trigger cards stack vertically on narrow screens. Trigger controls use responsive grids and `min-w-0`/full-width controls so long source/meter labels do not overlap neighboring inputs.

## Success Criteria

A planner can assign multiple tasks to one part, continue to a dedicated trigger step, give each task a different TBM/UBM/CBM/FBM configuration, save once, see the trigger coverage on the schedule list/detail, and later reopen that target directly in trigger setup. Existing due-generation and automation tests remain green without schema changes.
