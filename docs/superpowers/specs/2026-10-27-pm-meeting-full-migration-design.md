# iAssetsPro PM Meeting Full Migration Design

## Intent
Implement the engineer-meeting model as the authoritative iAssetsPro asset/PM architecture. Preserve the existing configurable functional-location system and technical component registry, but make the exact maintainable node the PM planning authority instead of a schedule container.

## Goals
- Keep placement and technical composition as separate trees.
- Company-defined placement hierarchy remains configurable in names and depth (examples: System/Site/Plant/Area/District/Location or Continent/Country/District/Location) and ends at the installed machine/asset.
- Technical hierarchy remains Machine/Asset -> Assembly -> Subassembly -> Component -> Part -> Sub-part/maintainable node.
- PM assignments attach directly to the exact coded maintainable node. Whole-machine PM is allowed when no component target is supplied.
- PM task planning fields: task, Value, unit, Calendar or Meter basis, PM Type (TBM/UBM/CBM/FBM), Activity Mode (Inspection/Lubrication/Servicing/Replacement), Est. Minutes, Inspection Type strictly Running or Standstill, and due state.
- Calendar due fields use a calendar date picker; sub-day TBM preserves exact time when required.
- Asset meters become first-class records assigned to an asset rather than being inferred only from historical readings. PM meter tasks reference the assigned meter and inherit its unit.
- Machine view rolls up due and near-due work from all descendant maintainable nodes.
- Compatible Standstill work can be bundled into one shutdown work order; Running and Standstill work are never mixed in one generated bundle.
- Existing production PM data is migrated without losing schedule/task/work-order provenance.

## Non-goals
- Do not replace the existing functional-location hierarchy engine.
- Do not merge placement hierarchy with technical component/BOM hierarchy.
- Do not remove historical PmSchedule rows immediately; they remain legacy provenance during migration.
- Do not require every component node to be schedulable; PM targets are any maintainable technical node chosen by the planner.

## Constraints
- PostgreSQL/Prisma/Next.js current stack.
- Existing RBAC and plant scope remain authoritative.
- Existing generated work orders and task execution history must continue to resolve.
- Migration must be additive first, backfill second, cutover third; no destructive schema step in the initial release.
- Existing PM automation must stay operational throughout cutover.

## Approaches considered
1. Rebuild PM around a new `PmPlanTask` model. Cleanest domain model, but duplicates mature recurrence/generation logic and creates the highest migration risk.
2. Evolve `PmScheduleTask` into the direct PM assignment record while making `scheduleId` legacy/optional. This preserves recurrence, due-cycle, closeout and WO-generation logic while removing schedule-container authority. **Chosen.**
3. Keep PmSchedule as the authority and only hide it in the UI. Rejected because it violates the meeting requirement that the part/task is the schedule authority.

## Chosen architecture
`PmScheduleTask` becomes the canonical PM assignment. It gains direct `assetId` and optional `componentId`, canonical `pmType`, `activityMode`, `basis`, optional `assetMeterId`, and a legacy nullable `scheduleId`. Existing rows are backfilled from their schedule. Legacy schedule title/header fields remain readable but no longer define recurrence for migrated rows.

`AssetMeter` becomes the asset-owned meter definition. `MeterReading` can reference it. Existing distinct `(assetId, meterName, unit)` readings are backfilled into AssetMeter records. New meter-based PM assignments reference `assetMeterId`; name/unit snapshots remain for compatibility/history.

The existing `HierarchySystem`/`HierarchyLevel`/`FunctionalLocation` models remain the placement hierarchy. `ComponentRegistry` remains the technical hierarchy. PM UI displays both: live functional location path for where the machine is installed, and component ancestry for what exact machine part is maintained.

## PM semantics
- `basis`: `calendar` or `meter` for TBM/UBM planning; CBM/FBM use their own evaluation sources but still retain direct target identity.
- `pmType`: `tbm`, `ubm`, `cbm`, `fbm`.
- `activityMode`: `inspection`, `lubrication`, `servicing`, `replacement`.
- `inspectionType`: persisted through the existing equipment-state field with canonical values `running` and `standstill`; legacy `stopped` normalizes to `standstill`.
- `Value`: the recurrence interval/threshold value shown to planners; no “Value / Interval” wording.
- Calendar planning uses a visible date picker. For minute/hour TBM, exact datetime remains available.
- Meter unit is read-only from the assigned AssetMeter.

## Roll-up and bundling
A machine roll-up query returns PM assignments for the machine and all technical descendants, their component path, due status and planning window. A bundling service groups due assignments by machine + inspection type + compatible planning window. Standstill tasks are eligible for shutdown bundling; Running tasks stay separate from Standstill. Generated WO retains parent `assetId`, exact component links and task provenance.

## Migration and compatibility
1. Add new fields/models without removing old fields.
2. Backfill AssetMeter from existing meter readings.
3. Backfill direct target and canonical planning fields on PmScheduleTask from PmSchedule and current task fields.
4. New APIs/UI write direct assignments; legacy PM schedule endpoints continue to read during transition.
5. Due engine and closeout use direct target fields first, legacy schedule fallback second.
6. After production verification, old schedule-authoring UI becomes read-only legacy history; destructive removal is a later release.

## Success criteria
- Planner can build/rename arbitrary location levels and assign a machine to the lowest allowed location.
- Planner can build the internal machine tree and select any coded maintainable node.
- Planner creates a PM assignment directly on that node without entering a schedule name.
- Meter can be assigned on the asset, readings recorded against it, and PM uses its unit automatically.
- Machine roll-up shows all descendant PM due/near-due work and component path.
- Standstill tasks can be bundled into one shutdown WO without mixing Running work.
- Existing PM records remain readable and continue generating/closing correctly after backfill.
