# PM Assignment Row Authoring Correction

## Intent
Restore the PM Assignment form to the compact task-row workflow that existed before the meeting migration, while keeping only the agreed meeting changes: exact machine/component targeting, `PM Type`, `Activity Mode`, `Inspection Type`, and first-class asset-meter selection for meter-based work.

The form is for planners assigning one or more reusable PM tasks to a selected machine or exact maintainable component. Every task row owns its own planning conditions. The same Task Library task may appear more than once when the planner needs different planning conditions.

## Goals
- Select the asset first, then choose the exact PM target.
- Display target information vertically: Choose PM Target first, then Location Path on its own row, then Technical Path on its own row.
- Offer both existing task-authoring paths: load all tasks from a PM Template, or add tasks from the Task Library.
- Render every selected task as a compact row/card matching the pre-migration task planner arrangement.
- Keep per-task fields: Frequency Type, Frequency Unit or Meter, Value, PM Type, Activity Mode, Inspection Type, Est. Minutes, Lead Days, Next Due Date, and conditional CBM fields.
- Allow the same Task Library task to be added multiple times with different settings.
- Show task count and cumulative estimated duration while authoring.
- For meter-based rows, list first-class AssetMeters already configured on the selected machine. The chosen meter supplies the authoritative unit and current reading.
- Remove Add Meter / Manage Meter / Record Reading controls from the PM Assignment form.
- Put meter administration in a permission-gated **Meters** tab on Asset Details, where definitions and authoritative readings belong.
- Save all rows for one target as one transactional multi-assignment request.

## Non-goals
- Do not move meter administration into PM authoring.
- Do not redesign the Task Library or PM Template editors.
- Do not remove legacy PM Schedule history or compatibility paths.
- Do not add a new database migration; current direct-assignment rows already support repeated `pmTaskId` values because `scheduleId` is null.

## Constraints
- Existing direct-assignment backend remains the source of validation for TBM/UBM/CBM/FBM.
- `Inspection Type` uses the canonical values Running and Standstill.
- `PM Type` options remain TBM, UBM, CBM, FBM.
- `Activity Mode` options remain Inspection, Lubrication, Servicing, Replacement.
- Meter-based rows must select an active AssetMeter belonging to the selected asset.
- Direct assignment rows must target the selected asset and optional exact component consistently.

## Approaches considered
### 1. Dedicated direct-assignment row planner — selected
Build a direct-assignment planner that deliberately reuses the old row layout and Task Library picker patterns but maps to the direct-assignment API. This isolates the correction from the legacy schedule engine, supports FBM cleanly, and lets direct assignments use first-class AssetMeter IDs without forcing a broad legacy-service refactor.

### 2. Retrofit `PmScheduleTaskPlanner` for both legacy schedules and direct assignments
This would reduce UI duplication, but it would also force the legacy schedule draft/service types to absorb FBM, activity mode, first-class meter IDs, and duplicate-task semantics. That is a larger regression surface for a form correction.

### 3. Revert to the old PM Schedule creation form
This would visually recover yesterday's arrangement quickly, but it would undo the approved direct assignment architecture and reintroduce a schedule container that the meeting explicitly removed for new PM assignments.

## Chosen interaction design
1. Asset selector.
2. PM target block with `Choose PM Target` at the top.
3. Full-width `Location Path` row.
4. Full-width `Technical Path` row.
5. Optional `Task Template` selector that replaces/populates the current task rows from that template.
6. `Tasks & Planning` row editor with `Add Task from Library` always available.
7. Each task row shows the task identity plus compact planning fields in the same visual rhythm as yesterday.
8. Adding a library task that is already present creates another row instead of disabling it.
9. Summary shows number of task rows and total estimated minutes/hours.
10. Save submits the selected target plus all task rows transactionally.

## Validation behavior
- TBM: positive whole-number Value, valid time unit, Next Due Date required.
- UBM: positive Value and active AssetMeter required; meter unit is inherited.
- CBM: source/metric/operator/numeric threshold required; range operator requires upper > lower.
- FBM: no cadence/meter value is required; it waits for a failure event.
- Estimated minutes and lead days must be non-negative whole numbers.
- Duplicate Task Library identities are valid for direct assignment rows.
