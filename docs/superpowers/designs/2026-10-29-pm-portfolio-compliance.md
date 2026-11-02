# PM Portfolio Compliance Design

**Date:** 2026-10-29

## Intent

Extend the machine-level PM compliance intelligence into a management portfolio view so planners and maintenance leaders can see which plants, departments, and machines are carrying the highest overdue/missed PM exposure without opening each machine one by one.

## Chosen approach

Use one scoped execution-history query and aggregate it in memory by machine and department. Do not call the machine compliance API repeatedly. This preserves the exact cycle semantics already shipped while avoiding N+1 database/API traffic as the asset count grows.

## Scope

The portfolio view must answer:

- What is completion compliance across the selected plant/window?
- How many PM cycles matured, completed, remain open overdue, or were missed?
- Which departments have the weakest compliance and largest overdue exposure?
- Which machines are the worst contributors?
- What are the oldest currently open overdue cycles?

## Source of truth and semantics

Reuse the existing direct-PM cycle semantics from `pmCompliance.service.ts`:

- cycle identity: `pmScheduleTaskId + pmDueCycleKey`
- TBM due instant: immutable planning snapshot `nextDueDate` when valid
- triggered UBM/CBM/FBM due instant: execution `createdAt`
- malformed legacy snapshot fallback: execution `createdAt`
- duplicate attempts collapse to one cycle
- completed attempt wins over active/replanned/cancelled attempts
- open matured active cycles count as `overdue_open`
- terminal failed/skipped/cancelled-only cycles count as `missed`
- completion compliance: `completed / maturedCycles * 100`, null for zero matured cycles

No alternative portfolio-only KPI formula is allowed.

## Scope and authorization

The API accepts a required `plantId`, optional `departmentId`, and `windowDays` in 1–365 (default 30).

The requested plant must pass the same authenticated strict plant-scope check used by other PM APIs before history is queried. Optional department filtering is applied only inside the already-authorized plant.

## Data model

No schema migration.

The portfolio execution query selects direct PM assignment history plus machine metadata from the related PM assignment asset:

- asset id, name, asset tag
- asset department id/name when present
- plant id
- PM type / maintenance mode
- execution/work-order state needed by the existing compliance classifier

Unassigned-department assets are grouped under `Unassigned` rather than dropped.

## Aggregation

Return:

### Portfolio summary
- maturedCycles
- completed
- openOverdue
- missed
- completionCompliancePct
- machinesWithMaturedCycles
- machinesWithOpenOverdue

### Department rows
One row per department represented in matured cycles:
- departmentId nullable
- departmentName (`Unassigned` fallback)
- machineCount
- maturedCycles
- completed
- openOverdue
- missed
- completionCompliancePct
- oldestOpenOverdueMinutes nullable

Sort by risk: open overdue descending, missed descending, compliance ascending with null last, then department name.

### Machine rows
One row per machine represented in matured cycles:
- assetId, assetName, assetTag
- department id/name
- maturedCycles
- completed
- openOverdue
- missed
- completionCompliancePct
- oldestOpenOverdueMinutes nullable

Sort by risk with the same ordering, then asset name.

### Oldest open overdue cycles
Return the 10 oldest current `overdue_open` cycles across the filtered portfolio, with machine identity, department, task, due instant, work order, and delay.

## UI

Add a new focused `PmPortfolioCompliancePanel` above the existing Machine PM Roll-up on the PM schedules/planning surface.

Controls:
- Plant selector (required)
- optional Department selector
- reporting window: 30 / 90 / 180 / 365 days
- refresh

Content:
- portfolio KPI cards
- department risk table
- machine risk table, capped to the top 15 risk rows in the first slice
- oldest open overdue list

The machine roll-up remains available below for drilling into a specific asset. The portfolio panel does not auto-change the machine selector in this slice.

## Empty and failure behavior

- no authenticated session → 401
- inaccessible plant → 403
- missing plant → 400
- unknown plant → 404
- no matured cycles → zero counts, null compliance, empty rankings
- missing department on an asset → `Unassigned`
- malformed legacy snapshots remain reportable through the existing fallback semantics

## Non-goals

- no new notification/escalation engine
- no scheduler/recurrence changes
- no persistent reporting table/materialized view yet
- no CSV/Excel export in this slice
- no trend chart across prior periods yet
- no automatic work-order actions from the portfolio table yet
