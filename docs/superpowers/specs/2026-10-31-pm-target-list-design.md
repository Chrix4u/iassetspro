# PM Target-Centered List Design

## Intent
Replace the mixed task-level + legacy PM schedule presentation with one authoritative PM list centered on the maintainable target (whole machine or exact part/component). The page must stay concise while preserving full task planning detail behind View/Edit.

## Goals
- Remove the visible Legacy PM Schedules section from PM Planning; keep historical records/backend compatibility intact.
- Show one row per direct PM target, grouping all active direct PM assignments on that target.
- Row summary: part/target name, parent asset, task count, PM-type coverage, nearest due state, total estimated minutes, and View/Edit/Delete actions.
- View opens full task details and all planning conditions for every active task on the target.
- Edit opens the existing direct-assignment authoring experience preloaded with the target's tasks; the target is fixed and saves atomically as a target-level replacement.
- Delete deactivates all active direct assignments for that target atomically, retaining audit/history.
- Add filters for search, asset, part/component, PM type, activity mode, inspection type, frequency type, and due state.

## Non-goals
- Do not physically delete legacy PM schedule records.
- Do not change work-order generation semantics or recurrence engines.
- Do not merge different components under a machine into one row.

## Approach
Use `PmScheduleTask` direct assignments (`scheduleId = null`) as the canonical list source. Build a pure client projection that groups assignments by `assetId + componentId` and evaluates filters without discarding the group's complete task set. Add a target-level transactional mutation endpoint so group edits/deactivation cannot partially succeed. Extend the existing PM assignment dialog to support fixed-target edit mode instead of creating a second editor.

## UX
Desktop/tablet use a compact filter bar above a target table. Mobile filters wrap cleanly. Each target appears once. A part/component name is primary; the machine is secondary. Whole-machine PM uses the machine name as the target. Actions are explicit View, Edit and Delete controls. View details use task cards containing Task #/description, PM type, activity mode, inspection type, frequency/interval/unit or meter, next due, estimated minutes, lead days, and CBM source/operator/threshold/cadence where applicable.

## Filter semantics
- PM Type: TBM / UBM / CBM / FBM.
- Frequency Type: Time/Day (TBM), Meter Based (UBM), Event/Condition (CBM/FBM).
- Due State: Overdue, Due Soon (7 days), Scheduled, Meter Driven, Condition/Event Driven.
- A target is shown when at least one of its tasks matches task-level filters, but View always shows all active tasks for that target.

## Safety
All target mutations remain plant-scoped and permission-checked. Delete is logical deactivation, not destructive deletion. Target edits execute in one database transaction and audit create/update/deactivate operations.
