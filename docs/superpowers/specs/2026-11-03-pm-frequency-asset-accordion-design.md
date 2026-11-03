# PM Frequency Independence + Asset Accordion Design

## Intent
Make PM authoring and planning easier to understand at plant scale: PM Type is the maintenance strategy/classification, while Frequency Type is the scheduling basis. The PM schedule list should be machine-first so a plant with many maintainable parts does not become one long mixed target table.

## Goals
- Allow each Frequency Type to be selected independently of PM Type.
- Persist and reload the chosen frequency basis independently of `pmType`.
- Keep existing direct assignment data compatible by reusing the existing `basis` field (`calendar`, `meter`, or null/event).
- Show PM Type labels as acronyms only: `TBM`, `UBM`, `CBM`, `FBM`.
- Group PM target rows under their parent asset/machine in a collapsible accordion.
- Show only scheduled targets/parts under each machine; whole-machine PM remains a child target when present.
- Preserve filters, target-level View/Edit/Configure Triggers/Delete actions, and existing direct-assignment APIs.

## Non-goals
- No Prisma schema migration.
- No new schedule container model.
- No rewrite of legacy PM schedules.
- No new generic external event-source subsystem.

## Architecture
### Frequency semantics
Direct assignments use `PmScheduleTask.basis` as the authoritative frequency basis:
- `time_day` -> `basis = calendar`; time unit, interval, and next due date are required.
- `meter` -> `basis = meter`; asset meter and positive interval are required.
- `event` -> `basis = null`; no time/meter cadence is required. Existing CBM condition and FBM event behavior remains available here.

`pmType` remains independent and is persisted as `pmType` / `maintenanceMode`. The direct-assignment due engine and recurrence advancement use `basis` first for direct assignments (`scheduleId = null`), while legacy schedule-backed tasks continue using their existing maintenance-mode behavior.

CBM condition-source fields are required only when the task is using event/condition frequency. With calendar or meter frequency, CBM is a classification and the selected cadence is authoritative.

### Machine-first planning list
Filtering remains target/task-aware. After filters are applied, matching target groups are rolled up by `assetId`. Each asset becomes one accordion item containing a compact nested target table without a repeated Asset column. The machine header summarizes scheduled target count, task count, and PM coverage.

## Approaches considered
1. **UI-only decoupling** — rejected because saved records would reload with the old PM-Type-derived frequency and automation would still use the old coupling.
2. **Add a new database frequency column** — rejected because `PmScheduleTask.basis` already stores the required scheduling authority.
3. **Reuse `basis` and make direct runtime basis-first** — selected because it is migration-free, backward compatible, and keeps legacy schedule behavior isolated.

## Constraints
- Existing direct PM Tasks -> Triggers workflow remains authoritative.
- Existing PM target actions remain target-scoped.
- Legacy schedule-backed PM behavior must not change.
- Full CI, Repairs UAT, and platform E2E remain merge gates.
