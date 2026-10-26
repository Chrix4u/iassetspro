# PM Schedule Compact Form Redesign

## Goal
Make PM schedule authoring dense enough for large task lists while keeping schedule definition separate from work-order execution assignment.

## Form hierarchy
- Row 1 desktop: Title | Asset.
- Row 2 desktop: PM Target | PM Template starter.
- Compact summary near the top: task count + total estimated task time (minutes and hours).
- Task cards: identity/description row, then a dense planning grid; condition-only controls appear only for CBM.
- Schedule footer: automatic work-order generation only. Technician, department and priority are not schedule-authoring inputs.

## Task planning
Planning order: Frequency Type, Frequency Unit, Frequency Value, Inspection Type, Maintenance Mode, Estimated Minutes, Lead Days, Next Due Date.

Frequency Type is UI planning state with `time_day` and `meter`. It maps to existing task recurrence fields without a schema migration. Time/day units are minutes, hours, days, weeks, months and years. Meter selection remains authoritative from asset meter sources and captures both meter identity and unit. Equipment State is relabeled Inspection Type; persisted values remain `running`/`stopped` for compatibility.

Maintenance Mode remains TBM/UBM/CBM in persisted data. Selecting time/day drives TBM; meter drives UBM. Selecting CBM reveals compact condition controls while recurrence fields are not serialized.

## Duration
Total schedule estimated time is the sum of valid task `estimatedMinutes`. Modern task-authority schedules save the total to the existing schedule `estimatedDuration` field in hours. The form shows both minutes and a human-readable hours/minutes breakdown. No manual schedule duration input remains.

## Compatibility
No database migration. Existing legacy-header schedules retain their legacy cadence editing path. Existing assignment/department/priority data remains readable historically but modern schedule edits do not create or change those execution fields.
